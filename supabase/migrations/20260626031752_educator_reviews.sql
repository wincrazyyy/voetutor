/* ==========  EDUCATOR REVIEWS  ==========
   Adds the educator_reviews table (imported testimonials now, verified-student path reserved),
   the denormalized aggregate columns on educator_profiles, the maintenance + immutability triggers,
   the public read RPC, the admin visibility RPC, and RLS. Mirrors the declarative schema files (the
   source of truth); hand-authored because the declarative db diff cannot seed the existing LANGUAGE
   sql functions that forward-reference educator_profiles. See plans/educator-reviews.md. */

CREATE TYPE review_source AS ENUM ('imported', 'verified');

ALTER TABLE public.educator_profiles
    ADD COLUMN review_count INTEGER DEFAULT 0 NOT NULL CHECK (review_count >= 0),
    ADD COLUMN rating_sum INTEGER DEFAULT 0 NOT NULL CHECK (rating_sum >= 0);
COMMENT ON COLUMN public.educator_profiles.review_count IS 'Denormalized count of VISIBLE educator_reviews (imported-inclusive in v1). Maintained by internal.maintain_educator_review_stats; locked against direct user writes by protect_educator_admin_fields (depth-guarded). Average = rating_sum / review_count, computed at read time. v1 UI reads the aggregate off the returned review list instead; these columns are the maintained hook for the future directory-card aggregate.';

CREATE OR REPLACE FUNCTION internal.protect_educator_admin_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF internal.is_admin() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        /* The educator self-insert policy (educator_profiles_insert_self) does NOT restrict columns,
           so a direct client INSERT could otherwise self-grant verification / a premium tier / a
           vanity slug / a seeded aggregate. Coerce every admin-controlled column to its safe default
           on a non-admin insert — the BEFORE UPDATE branch below never sees INSERTs. */
        NEW.is_verified = FALSE;
        NEW.verified_by = NULL;
        NEW.verified_at = NULL;
        NEW.tier = 'basic'::public.educator_tier;
        NEW.slug = NULL;
        NEW.review_count = 0;
        NEW.rating_sum = 0;
        RETURN NEW;
    END IF;

    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Only admins can change verification status.';
    END IF;
    IF NEW.verified_by IS DISTINCT FROM OLD.verified_by OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Verification audit columns are admin-only.';
    END IF;
    IF NEW.tier IS DISTINCT FROM OLD.tier THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Only admins can change an educator''s tier.';
    END IF;
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: The vanity slug is not user-settable yet.';
    END IF;

    /* review_count / rating_sum are trigger-maintained (internal.maintain_educator_review_stats),
       not user-settable. The maintenance write arrives at pg_trigger_depth() = 2, so guard the lock
       to depth 1 — a direct user UPDATE is blocked, the nested aggregate write passes through. */
    IF pg_trigger_depth() <= 1 THEN
        IF NEW.review_count IS DISTINCT FROM OLD.review_count THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: review_count is maintained by trigger, not user-settable.';
        END IF;
        IF NEW.rating_sum IS DISTINCT FROM OLD.rating_sum THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: rating_sum is maintained by trigger, not user-settable.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_educator_admin_fields() IS 'Locks the admin-controlled educator_profiles columns (is_verified, verified_by, verified_at, tier, slug) and the trigger-maintained aggregate columns (review_count, rating_sum) against non-admin mutation on BOTH insert and update, mirroring protect_profile_role. On a non-admin INSERT the columns are coerced to safe defaults (the educator self-insert RLS policy does not restrict columns, so a direct client insert would otherwise self-grant them); on UPDATE any change RAISEs. The review_count / rating_sum checks are guarded to pg_trigger_depth() <= 1 so internal.maintain_educator_review_stats (which writes them from a nested AFTER trigger at depth 2) is not rejected. Admins set the verified / tier columns via the set_educator_verified / set_educator_tier RPCs; those writes pass because internal.is_admin() — read from the preserved auth.uid() — is true even inside the SECURITY DEFINER functions. Plain trigger function (no SECURITY DEFINER, no search_path pin).';

CREATE OR REPLACE FUNCTION internal.maintain_educator_review_stats()
RETURNS TRIGGER AS $$
DECLARE
    v_educator UUID;
BEGIN
    v_educator := COALESCE(NEW.educator_id, OLD.educator_id);

    UPDATE public.educator_profiles ep
    SET review_count = agg.cnt,
        rating_sum   = agg.total
    FROM (
        SELECT
            COUNT(*)::INTEGER AS cnt,
            COALESCE(SUM(rating), 0)::INTEGER AS total
        FROM public.educator_reviews r
        WHERE r.educator_id = v_educator
          AND r.is_visible = TRUE
    ) AS agg
    WHERE ep.educator_id = v_educator;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.maintain_educator_review_stats() IS 'AFTER trigger on educator_reviews (insert / update / delete). Recomputes educator_profiles.review_count and rating_sum from the VISIBLE reviews of the affected educator, so visibility flips and deletes stay consistent. SECURITY DEFINER + empty search_path so it can write a row the acting user does not own despite FORCE RLS. No-ops when the educator_profiles row does not exist yet (an approved educator who never built a profile) — recomputed on the next write once the row exists. Imported-inclusive in v1; the future verified-only directory-card aggregate would use separate columns (see plans/educator-reviews.md section 8). The nested educator_profiles UPDATE arrives at pg_trigger_depth() = 2, which protect_educator_admin_fields allows for these two columns.';

CREATE TABLE public.educator_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    educator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    source review_source DEFAULT 'imported'::review_source NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL CHECK (char_length(trim(comment)) > 0 AND char_length(comment) <= 1500),
    reviewer_first_name TEXT CHECK (reviewer_first_name IS NULL OR char_length(reviewer_first_name) <= 80),
    reviewer_last_name TEXT CHECK (reviewer_last_name IS NULL OR char_length(reviewer_last_name) <= 80),
    reviewer_school TEXT CHECK (reviewer_school IS NULL OR char_length(reviewer_school) <= 120),
    reviewer_image_url TEXT CHECK (
        reviewer_image_url IS NULL
        OR (char_length(reviewer_image_url) <= 2048 AND reviewer_image_url ~* '^https://')
    ),
    is_visible BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_review_source_shape CHECK (
        (source = 'imported'::review_source AND student_id IS NULL)
        OR (source = 'verified'::review_source AND student_id IS NOT NULL)
    )
);
COMMENT ON TABLE public.educator_reviews IS 'Reviews / testimonials shown on an educator''s public profile. source = imported: a testimonial the educator (or an admin) carries over from outside the platform, labelled "Imported" in the UI as unverified — the v1 path and the manual legacy-migration target. source = verified: a future path for reviews written by a registered enrolled student (student_id set, identity read through profiles_public). Reviewer identity for imported rows lives in the denormalized reviewer_* columns since there is no platform account behind them.';
COMMENT ON COLUMN public.educator_reviews.source IS 'imported (educator-supplied, unverified, v1) or verified (registered-student-authored, future). Drives the "Imported" label and the verified/imported RLS + aggregate split.';
COMMENT ON COLUMN public.educator_reviews.student_id IS 'NULL for imported reviews (legacy / guest). Set only for the future verified path, where the reviewer is a real enrolled student; identity is then read through profiles_public, not the reviewer_* columns.';
COMMENT ON COLUMN public.educator_reviews.is_visible IS 'Moderation lever, default TRUE. Hidden reviews never reach get_public_educator_reviews and never count toward the educator_profiles aggregate. Admin-controlled via set_review_visibility.';
COMMENT ON CONSTRAINT chk_review_source_shape ON public.educator_reviews IS 'Imported reviews carry no student_id; verified reviews must. NOTE for the verified phase: student_id is ON DELETE SET NULL, which would violate this CHECK for a verified row when the student account is deleted — resolve before shipping verified (see plans/educator-reviews.md section 8).';

CREATE INDEX idx_educator_reviews_educator_id ON public.educator_reviews(educator_id);
CREATE INDEX idx_educator_reviews_student_id ON public.educator_reviews(student_id);

CREATE INDEX idx_educator_reviews_visible
    ON public.educator_reviews(educator_id, created_at DESC)
    WHERE is_visible = TRUE;
COMMENT ON INDEX idx_educator_reviews_visible IS 'Partial + ordered index for the public read slice (get_public_educator_reviews: WHERE educator_id = ? AND is_visible ORDER BY created_at DESC).';

CREATE UNIQUE INDEX uniq_educator_reviews_verified_per_student
    ON public.educator_reviews(educator_id, student_id)
    WHERE source = 'verified'::review_source;
COMMENT ON INDEX uniq_educator_reviews_verified_per_student IS 'One verified review per student per educator. Reserved for the verified phase; inert while no verified rows exist.';

CREATE TRIGGER set_educator_reviews_updated_at
    BEFORE UPDATE ON public.educator_reviews
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

CREATE TRIGGER enforce_immutability_educator_reviews
    BEFORE UPDATE ON public.educator_reviews
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();

CREATE TRIGGER maintain_educator_review_stats_on_insert
    AFTER INSERT ON public.educator_reviews
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_educator_review_stats();

CREATE TRIGGER maintain_educator_review_stats_on_update
    AFTER UPDATE ON public.educator_reviews
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_educator_review_stats();

CREATE TRIGGER maintain_educator_review_stats_on_delete
    AFTER DELETE ON public.educator_reviews
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_educator_review_stats();

ALTER TABLE public.educator_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.educator_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY educator_reviews_select_owner_or_admin ON public.educator_reviews
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR educator_id = (SELECT auth.uid())
    );

CREATE POLICY educator_reviews_insert_owner ON public.educator_reviews
    FOR INSERT TO authenticated
    WITH CHECK (
        educator_id = (SELECT auth.uid())
        AND source = 'imported'::review_source
        AND student_id IS NULL
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'educator'::public.user_role
        )
    );

CREATE POLICY educator_reviews_insert_admin ON public.educator_reviews
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT internal.is_admin()));

CREATE POLICY educator_reviews_update_owner ON public.educator_reviews
    FOR UPDATE TO authenticated
    USING (educator_id = (SELECT auth.uid()) AND source = 'imported'::review_source)
    WITH CHECK (educator_id = (SELECT auth.uid()) AND source = 'imported'::review_source);

CREATE POLICY educator_reviews_update_admin ON public.educator_reviews
    FOR UPDATE TO authenticated
    USING ((SELECT internal.is_admin()))
    WITH CHECK ((SELECT internal.is_admin()));

CREATE POLICY educator_reviews_delete_owner_or_admin ON public.educator_reviews
    FOR DELETE TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR (educator_id = (SELECT auth.uid()) AND source = 'imported'::review_source)
    );

CREATE OR REPLACE FUNCTION public.get_public_educator_reviews(p_educator_id UUID)
RETURNS TABLE (
    id UUID,
    rating SMALLINT,
    comment TEXT,
    reviewer_first_name TEXT,
    reviewer_last_name TEXT,
    reviewer_school TEXT,
    reviewer_image_url TEXT,
    source public.review_source,
    created_at TIMESTAMPTZ
) AS $$
    SELECT
        r.id, r.rating, r.comment,
        r.reviewer_first_name, r.reviewer_last_name, r.reviewer_school,
        r.reviewer_image_url, r.source, r.created_at
    FROM public.educator_reviews r
    JOIN public.educator_profiles ep ON ep.educator_id = r.educator_id
    JOIN public.profiles p ON p.id = ep.educator_id
    WHERE r.educator_id = p_educator_id
      AND r.is_visible = TRUE
      AND ep.is_published = TRUE
      AND (
        (p.role = 'educator'::public.user_role AND p.is_approved = TRUE)
        OR p.role = 'admin'::public.user_role
      )
    ORDER BY r.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.get_public_educator_reviews(UUID) IS 'Public read boundary for an educator''s reviews: returns ONLY visible reviews of a published, approved educator (or admin). Same anon access pattern as get_public_educator_profile; the WHERE clause plus the column list ARE the boundary. Reviewer identity comes from the denormalized reviewer_* columns (imported reviews). When the verified path ships, verified rows would join profiles_public for live student identity. Does not widen profiles_public.';

REVOKE EXECUTE ON FUNCTION public.get_public_educator_reviews(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_educator_reviews(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_review_visibility(p_review_id UUID, p_visible BOOLEAN)
RETURNS VOID AS $$
BEGIN
    IF NOT internal.is_admin() THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Only admins can moderate reviews.';
    END IF;

    UPDATE public.educator_reviews SET is_visible = p_visible WHERE id = p_review_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Review % not found.', p_review_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.set_review_visibility(UUID, BOOLEAN) IS 'Admin-only: toggles a review''s is_visible flag. The AFTER UPDATE maintenance trigger recomputes the educator''s review_count / rating_sum, so hidden reviews drop out of the aggregate. Mirrors set_educator_verified.';

REVOKE EXECUTE ON FUNCTION public.set_review_visibility(UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_review_visibility(UUID, BOOLEAN) TO authenticated;
