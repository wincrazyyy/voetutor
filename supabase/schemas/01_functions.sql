/* ==========  01_functions.sql  ==========
   Every SECURITY DEFINER and trigger function in the project lives here,
   processed before tables. PL/pgSQL bodies are parsed at CREATE time but
   reference resolution is deferred to first execution, so forward refs
   (e.g. trigger functions referencing public.X tables, or each other)
   are intentional and safe. The internal schema isolates helpers and
   trigger functions from PostgREST; only the two RPC entry points at
   the bottom (approve_educator, enroll_in_free_class) live in public. */

/* ==========  PRIVATE SCHEMA FOR HELPER & TRIGGER FUNCTIONS  ========== */

CREATE SCHEMA IF NOT EXISTS internal;
COMMENT ON SCHEMA internal IS 'Unexposed schema for SECURITY DEFINER trigger and RLS-helper functions. PostgREST does not expose this schema, so functions here cannot be invoked as RPCs from the client. Public RPC entry points (approve_educator, enroll_in_free_class) deliberately stay in the public schema.';

GRANT USAGE ON SCHEMA internal TO authenticated, anon, service_role;

/* ==========  GENERIC TRIGGER FUNCTIONS  ========== */

CREATE OR REPLACE FUNCTION internal.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.set_current_timestamp_updated_at() IS 'Generic trigger function to enforce accurate audit trails for record modifications.';

CREATE OR REPLACE FUNCTION internal.set_forum_post_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.set_forum_post_updated_at() IS 'Variant of set_current_timestamp_updated_at scoped to forum_posts. Skips the timestamp bump when the update originates inside a nested trigger chain (i.e., the upvote-ledger maintenance trigger), so endorsements do not pollute the post modification timestamp. User-issued edits still arrive at depth 1 and bump updated_at as expected.';

CREATE OR REPLACE FUNCTION internal.maintain_class_published_at()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_published = TRUE AND NEW.published_at IS NULL THEN
            NEW.published_at = NOW();
        ELSIF NEW.is_published = FALSE THEN
            NEW.published_at = NULL;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.is_published = TRUE AND OLD.is_published = FALSE THEN
        NEW.published_at = NOW();
    ELSIF NEW.is_published = FALSE AND OLD.is_published = TRUE THEN
        NEW.published_at = NULL;
    ELSIF NEW.is_published = OLD.is_published THEN
        NEW.published_at = OLD.published_at;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.maintain_class_published_at() IS 'Drives classes.published_at deterministically from is_published transitions: stamps NOW() when a class is published, clears the value when it is unpublished, and ignores any caller-supplied value when is_published has not changed. Removes a sliver of trust from the application layer — the timestamp cannot lie.';

CREATE OR REPLACE FUNCTION internal.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_intended TEXT := NEW.raw_user_meta_data->>'intended_role';
    v_role public.user_role;
    v_is_approved BOOLEAN;
BEGIN
    IF v_intended = 'educator' THEN
        v_role := 'educator'::public.user_role;
        v_is_approved := FALSE;
    ELSE
        v_role := 'student'::public.user_role;
        v_is_approved := TRUE;
    END IF;

    INSERT INTO public.profiles (id, first_name, last_name, display_name, role, is_approved)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        NEW.raw_user_meta_data->>'display_name',
        v_role,
        v_is_approved
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.handle_new_user() IS 'Automates profile provisioning upon identity creation. Reads intended_role from user-controlled metadata but constrains the resulting state: educator implies is_approved = FALSE (gated until an admin promotes them); anything else lands on a fully-approved student. The admin role is never assignable from this path, neutralising privilege escalation via signup metadata.';

CREATE OR REPLACE FUNCTION internal.maintain_forum_post_upvote_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_posts SET upvotes = upvotes + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.forum_posts SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.maintain_forum_post_upvote_count() IS 'Maintains the denormalized forum_posts.upvotes counter in lockstep with the forum_post_upvotes ledger. Runs as SECURITY DEFINER (search_path empty, fully-qualified references) so the upvoter (who is typically not the post owner) can mutate the counter despite forum_posts RLS.';

/* ==========  ANTI-TAMPERING TRIGGER FUNCTIONS  ========== */

CREATE OR REPLACE FUNCTION internal.prevent_immutable_modifications()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Primary key modifications are strictly prohibited.';
        END IF;
        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: created_at timestamp modifications are strictly prohibited.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.prevent_immutable_modifications() IS 'Hard-rejects any attempt to modify immutable tracking and identity columns (id, created_at) to ensure cryptographic audit integrity.';

CREATE OR REPLACE FUNCTION internal.prevent_educator_profile_modifications()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.educator_id IS DISTINCT FROM OLD.educator_id THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: educator_id (PK) modifications are strictly prohibited.';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: created_at timestamp modifications are strictly prohibited.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.prevent_educator_profile_modifications() IS 'Variant of prevent_immutable_modifications scoped to educator_profiles, which uses educator_id as its PK rather than the conventional id column. Locks both educator_id and created_at against post-insert mutation; the educator_profiles_update_self RLS WITH CHECK clause separately prevents row redirection.';

CREATE OR REPLACE FUNCTION internal.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT internal.is_admin() THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Only admins can modify user roles.';
        END IF;
        IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Only admins can change approval status.';
        END IF;
        IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Approval audit columns are admin-only.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_profile_role() IS 'Locks the role and approval columns (role, is_approved, approved_by, approved_at) against non-admin mutation. Admins flip is_approved via the approve_educator SECURITY DEFINER function, which bypasses this trigger only for that single column write.';

CREATE OR REPLACE FUNCTION internal.protect_forum_post_ownership()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT internal.is_admin() THEN
        IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Post authorship cannot be reassigned.';
        END IF;
        IF NEW.class_id IS DISTINCT FROM OLD.class_id THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Posts cannot be moved between classes.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_forum_post_ownership() IS 'Prevents users and educators from tampering with the original authorship or class association of a forum post.';

CREATE OR REPLACE FUNCTION internal.protect_forum_post_upvotes()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.upvotes IS DISTINCT FROM OLD.upvotes AND NOT internal.is_admin() THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Direct manipulation of upvote counts is prohibited. Insert into forum_post_upvotes instead.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_forum_post_upvotes() IS 'Hard-rejects direct UPDATEs to the denormalized forum_posts.upvotes column by non-admins. Legitimate increments and decrements flow through the forum_post_upvotes ledger and are detected via pg_trigger_depth().';

CREATE OR REPLACE FUNCTION internal.validate_forum_post_video_class()
RETURNS TRIGGER AS $$
DECLARE
    v_video_class_id UUID;
BEGIN
    IF NEW.video_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.video_id IS NOT DISTINCT FROM OLD.video_id
           AND NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT t.class_id INTO v_video_class_id
    FROM public.videos v
    JOIN public.subtopics s ON s.id = v.subtopic_id
    JOIN public.topics t ON t.id = s.topic_id
    WHERE v.id = NEW.video_id;

    IF v_video_class_id IS DISTINCT FROM NEW.class_id THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: forum_posts.video_id must reference a video belonging to the same class as the post (post class %, video class %).', NEW.class_id, v_video_class_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION internal.validate_forum_post_video_class() IS 'Closes the cross-class loophole left open by chk_forum_post_video_context: when a post references a video, that video''s grandparent class must equal the post''s class. CHECK constraints cannot reach across tables, hence the trigger. The UPDATE-path early-exit is wrapped in a nested IF (rather than a single conjoined expression) because PostgreSQL does not guarantee short-circuit evaluation, so OLD must only be referenced inside an explicit TG_OP = ''UPDATE'' branch.';

CREATE OR REPLACE FUNCTION internal.protect_video_class_lineage()
RETURNS TRIGGER AS $$
DECLARE
    v_old_class_id UUID;
    v_new_class_id UUID;
BEGIN
    IF NEW.subtopic_id IS NOT DISTINCT FROM OLD.subtopic_id THEN
        RETURN NEW;
    END IF;

    SELECT t.class_id INTO v_old_class_id
    FROM public.subtopics s JOIN public.topics t ON t.id = s.topic_id
    WHERE s.id = OLD.subtopic_id;

    SELECT t.class_id INTO v_new_class_id
    FROM public.subtopics s JOIN public.topics t ON t.id = s.topic_id
    WHERE s.id = NEW.subtopic_id;

    IF v_old_class_id IS DISTINCT FROM v_new_class_id
       AND EXISTS (SELECT 1 FROM public.forum_posts WHERE video_id = NEW.id) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: Cannot reparent video % to a subtopic in a different class while forum_posts reference it. Move or delete the dependent video_qa posts first.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION internal.protect_video_class_lineage() IS 'Prevents a video from being reparented to a subtopic whose grandparent class differs from the original, while forum_posts still reference it. Without this, moving a video could silently invalidate the forum_post -> video class invariant enforced by validate_forum_post_video_class.';

CREATE OR REPLACE FUNCTION internal.protect_subtopic_class_lineage()
RETURNS TRIGGER AS $$
DECLARE
    v_old_class_id UUID;
    v_new_class_id UUID;
BEGIN
    IF NEW.topic_id IS NOT DISTINCT FROM OLD.topic_id THEN
        RETURN NEW;
    END IF;

    SELECT class_id INTO v_old_class_id FROM public.topics WHERE id = OLD.topic_id;
    SELECT class_id INTO v_new_class_id FROM public.topics WHERE id = NEW.topic_id;

    IF v_old_class_id IS DISTINCT FROM v_new_class_id
       AND EXISTS (
           SELECT 1
           FROM public.forum_posts fp
           JOIN public.videos v ON v.id = fp.video_id
           WHERE v.subtopic_id = NEW.id
       ) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: Cannot reparent subtopic % to a topic in a different class while forum_posts reference videos within it. Move or delete the dependent video_qa posts first.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION internal.protect_subtopic_class_lineage() IS 'Mirrors protect_video_class_lineage one level up: blocks subtopic reparenting that would alter the class lineage of any video bound to a forum_post.';

CREATE OR REPLACE FUNCTION internal.protect_topic_class_lineage()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.forum_posts fp
        JOIN public.videos v ON v.id = fp.video_id
        JOIN public.subtopics s ON s.id = v.subtopic_id
        WHERE s.topic_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: Cannot move topic % to a different class while forum_posts reference videos within its subtree. Move or delete the dependent video_qa posts first.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION internal.protect_topic_class_lineage() IS 'Top of the class-lineage protection chain: blocks topic reassignment that would alter the class of any video bound to a forum_post.';

/* ==========  RLS HELPER FUNCTIONS  ========== */

CREATE OR REPLACE FUNCTION internal.get_user_role()
RETURNS public.user_role AS $$
DECLARE
    v_role public.user_role;
    v_is_approved BOOLEAN;
BEGIN
    SELECT role, is_approved INTO v_role, v_is_approved
    FROM public.profiles
    WHERE id = (SELECT auth.uid());

    IF v_role IS NULL THEN
        RETURN 'student'::public.user_role;
    END IF;

    IF v_role = 'educator'::public.user_role AND v_is_approved = FALSE THEN
        RETURN 'student'::public.user_role;
    END IF;

    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.get_user_role() IS 'Returns the EFFECTIVE authorisation level of the calling user. Equal to profiles.role except that unapproved educators (role = educator AND is_approved = FALSE) collapse back to student, so every RLS policy can keep its single-column role check without separately worrying about approval state. SECURITY DEFINER (search_path empty, fully-qualified references) bypasses RLS on profiles and is STABLE for per-query caching.';

CREATE OR REPLACE FUNCTION internal.get_user_class_ids()
RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY
        SELECT class_id FROM public.class_enrollments WHERE user_id = (SELECT auth.uid())
        UNION
        SELECT id FROM public.classes WHERE educator_id = (SELECT auth.uid());
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.get_user_class_ids() IS 'Calculates the authorization perimeter for class-bound resources, mapping a user to all enrolled or taught class IDs. Marked as STABLE for query optimization. search_path is empty and references are fully qualified to neutralize object-shadowing attacks against SECURITY DEFINER execution.';

CREATE OR REPLACE FUNCTION internal.is_class_educator(p_class_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = p_class_id AND educator_id = (SELECT auth.uid())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.is_class_educator(UUID) IS 'Bypasses RLS to check if the current user is the educator of a given class, preventing infinite recursion loops. search_path is empty and references are fully qualified to neutralize object-shadowing attacks against SECURITY DEFINER execution.';

CREATE OR REPLACE FUNCTION internal.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = 'admin'::public.user_role
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.is_admin() IS 'Cheap boolean predicate for "is the caller an admin?". SECURITY DEFINER bypasses RLS on profiles, so policies can reference this without depending on cross-table policy interactions or get_user_role overhead.';

CREATE OR REPLACE FUNCTION internal.is_active_educator()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
          AND role = 'educator'::public.user_role
          AND is_approved = TRUE
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.is_active_educator() IS 'Boolean predicate for "is the caller an APPROVED educator?". SECURITY DEFINER bypasses RLS on profiles. Unapproved educators return FALSE — matching the get_user_role downgrade convention but without coupling to enum identity.';

/* ==========  PUBLIC RPC FUNCTIONS  ========== */
/* RPCs deliberately live in the public schema so PostgREST can expose them
   to the authenticated client. Internal helpers and trigger functions live
   in the internal schema (above) and are never exposed via the Data API. */

CREATE OR REPLACE FUNCTION public.approve_educator(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    IF NOT internal.is_admin() THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Only admins can approve educators.';
    END IF;

    UPDATE public.profiles
    SET is_approved = TRUE,
        approved_by = (SELECT auth.uid()),
        approved_at = NOW()
    WHERE id = p_user_id
      AND role = 'educator'::public.user_role
      AND is_approved = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % is not a pending educator.', p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.approve_educator(UUID) IS 'Flips is_approved on the target educator profile and stamps the audit columns (approved_by / approved_at). SECURITY DEFINER (search_path empty, fully-qualified references) bypasses the protect_profile_role trigger; the function itself enforces the admin-only caller check.';

REVOKE EXECUTE ON FUNCTION public.approve_educator(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_educator(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.enroll_in_free_class(p_class_id UUID)
RETURNS VOID AS $$
DECLARE
    v_price INTEGER;
    v_published BOOLEAN;
    v_educator_id UUID;
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'AUTH REQUIRED: Must be signed in to enrol.';
    END IF;

    SELECT price_cents, is_published, educator_id
    INTO v_price, v_published, v_educator_id
    FROM public.classes WHERE id = p_class_id;

    IF v_price IS NULL THEN
        RAISE EXCEPTION 'Class % not found.', p_class_id;
    END IF;
    IF v_published IS NOT TRUE THEN
        RAISE EXCEPTION 'Class % is not currently open for enrolment.', p_class_id;
    END IF;
    IF v_price <> 0 THEN
        RAISE EXCEPTION 'Class % is paid; use the checkout flow.', p_class_id;
    END IF;
    IF v_educator_id = (SELECT auth.uid()) THEN
        RAISE EXCEPTION 'You teach this class — you cannot enrol as a student.';
    END IF;

    INSERT INTO public.class_enrollments (user_id, class_id)
    VALUES ((SELECT auth.uid()), p_class_id)
    ON CONFLICT (user_id, class_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.enroll_in_free_class(UUID) IS 'Self-enrolment path for free classes (price_cents = 0) only. SECURITY DEFINER bypasses the admin/educator-only insert policy on class_enrollments. Validates that the class exists, is published, and is genuinely free; paid classes must go through the Stripe checkout webhook.';

REVOKE EXECUTE ON FUNCTION public.enroll_in_free_class(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.enroll_in_free_class(UUID) TO authenticated;
