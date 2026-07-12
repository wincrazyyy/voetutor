/* ==========  CLASS ACCESS PASSES  ==========
   Sub-class content entitlement for trial & partial students (plans/trial-classes.md).
   One master class, one enrollment, one roster, one forum, one sidebar entry — with a
   per-student (or per-cohort) CONTENT SCOPE layered onto the enrollment instead of
   cloning classes rows. The Access Pass (class_passes + class_pass_items +
   class_pass_holders) is a named, reusable subset of one class's curriculum; an
   enrollment is either full (today's behavior, the default, zero regression) or scoped,
   in which case the student sees exactly the union of the passes they hold. Enforcement
   is pure RLS via internal.* SECURITY DEFINER helpers. Hand-authored and idempotent,
   mirroring supabase/schemas 00-03 (the source of truth), in the same style as
   20260711120000_student_setup_tokens. */

/* ==========  1. ENUM  ========== */

DO $$
BEGIN
    CREATE TYPE public.enrollment_access AS ENUM ('full', 'scoped');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

/* ==========  2. TRIGGER FUNCTIONS  ==========
   plpgsql bodies resolve references at first execution, so forward refs to the
   tables created below are intentional and safe. */

CREATE OR REPLACE FUNCTION internal.protect_enrollment_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: enrollment user_id modifications are strictly prohibited.';
    END IF;
    IF NEW.class_id IS DISTINCT FROM OLD.class_id THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: enrollment class_id modifications are strictly prohibited.';
    END IF;
    IF NEW.enrolled_at IS DISTINCT FROM OLD.enrolled_at THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: enrolled_at timestamp modifications are strictly prohibited.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_enrollment_columns() IS 'Locks the identity columns of class_enrollments (user_id, class_id, enrolled_at) against UPDATE now that the table carries its first UPDATE policy (enrollments_update_educator_or_admin, which exists so the class educator / admin can flip access_scope). Membership identity stays immutable — only access_scope is legitimately mutable. Plain trigger function, mirroring prevent_student_profile_modifications.';

CREATE OR REPLACE FUNCTION internal.prevent_pass_reparent()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.class_id IS DISTINCT FROM OLD.class_id THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: A pass cannot be moved to a different class.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.prevent_pass_reparent() IS 'Blocks moving a class_passes row between classes: a reparent would silently rescope every holder and every targeted announcement / invite that references the pass. Plain trigger function; class_id is set once at creation and never legitimately changes.';

CREATE OR REPLACE FUNCTION internal.validate_pass_item_class()
RETURNS TRIGGER AS $$
DECLARE
    v_class UUID;
BEGIN
    SELECT class_id INTO v_class FROM public.class_passes WHERE id = NEW.pass_id;

    IF NEW.topic_id IS NOT NULL THEN
        IF (SELECT class_id FROM public.topics WHERE id = NEW.topic_id) IS DISTINCT FROM v_class THEN
            RAISE EXCEPTION 'CONSTRAINT VIOLATION: pass item topic % does not belong to the pass''s class.', NEW.topic_id;
        END IF;
    ELSIF NEW.subtopic_id IS NOT NULL THEN
        IF (SELECT t.class_id
            FROM public.subtopics s
            JOIN public.topics t ON t.id = s.topic_id
            WHERE s.id = NEW.subtopic_id) IS DISTINCT FROM v_class THEN
            RAISE EXCEPTION 'CONSTRAINT VIOLATION: pass item subtopic % does not belong to the pass''s class.', NEW.subtopic_id;
        END IF;
    ELSIF NEW.video_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.video_placements vp
            WHERE vp.video_id = NEW.video_id
              AND internal.placement_class_id(vp.topic_id, vp.subtopic_id) = v_class
        ) THEN
            RAISE EXCEPTION 'CONSTRAINT VIOLATION: pass item video % is not placed in the pass''s class.', NEW.video_id;
        END IF;
    ELSIF NEW.resource_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.resource_placements rp
            WHERE rp.resource_id = NEW.resource_id
              AND internal.placement_class_id(rp.topic_id, rp.subtopic_id) = v_class
        ) THEN
            RAISE EXCEPTION 'CONSTRAINT VIOLATION: pass item note % is not placed in the pass''s class.', NEW.resource_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.validate_pass_item_class() IS 'Cross-table integrity for class_pass_items (a CHECK cannot reach across tables — same rationale as validate_forum_post_video_class): a topic / subtopic item must belong to the pass''s class, and a video / resource item must have at least one live placement resolving (via internal.placement_class_id) to that class. SECURITY DEFINER with empty search_path because admin-on-behalf inserts must validate cleanly regardless of the caller''s RLS window over the curriculum tables.';

CREATE OR REPLACE FUNCTION internal.validate_pass_holder_class()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT class_id FROM public.class_passes WHERE id = NEW.pass_id) IS DISTINCT FROM NEW.class_id THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: pass % does not belong to class %.', NEW.pass_id, NEW.class_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.validate_pass_holder_class() IS 'Cross-table integrity for class_pass_holders: the held pass must belong to the holder row''s class. A mismatched row would grant nothing (every scope helper joins class_pass_holders.class_id), but the invariant keeps internal.holds_class_pass and the roster UI honest. SECURITY DEFINER, empty search_path, fully-qualified references.';

CREATE OR REPLACE FUNCTION internal.validate_invite_pass_class()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pass_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF (SELECT class_id FROM public.class_passes WHERE id = NEW.pass_id) IS DISTINCT FROM NEW.class_id THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: invite pass % does not belong to class %.', NEW.pass_id, NEW.class_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.validate_invite_pass_class() IS 'Cross-table integrity for class_invites.pass_id: a scoped invite must reference a pass of its own class (NULL = full-access invite, always valid). SECURITY DEFINER, empty search_path, fully-qualified references.';

CREATE OR REPLACE FUNCTION internal.validate_announcement_pass_class()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pass_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF (SELECT class_id FROM public.class_passes WHERE id = NEW.pass_id) IS DISTINCT FROM NEW.class_id THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: announcement pass % does not belong to class %.', NEW.pass_id, NEW.class_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.validate_announcement_pass_class() IS 'Cross-table integrity for announcements.pass_id: a targeted announcement must reference a pass of its own class (NULL = broadcast to the whole class, always valid). SECURITY DEFINER, empty search_path, fully-qualified references.';

/* ==========  3. RLS HELPER FUNCTIONS  ========== */

CREATE OR REPLACE FUNCTION internal.get_full_access_class_ids()
RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY
        SELECT class_id FROM public.class_enrollments
        WHERE user_id = (SELECT auth.uid()) AND access_scope = 'full'::public.enrollment_access
        UNION
        SELECT id FROM public.classes WHERE educator_id = (SELECT auth.uid());
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.get_full_access_class_ids() IS 'The CONTENT-perimeter twin of internal.get_user_class_ids: class ids where the caller holds a FULL enrollment (access_scope = full) or is the teaching educator. Scoped enrollments are excluded — their content visibility flows through the scoped_* helpers instead. Used by the curriculum select policies (topics / subtopics / placements) and the amended video_in_user_classes / resource_in_user_classes; the membership perimeter (forum, announcements, receipts, class row) deliberately stays on get_user_class_ids so scoped students remain full community members.';

CREATE OR REPLACE FUNCTION internal.scoped_topic_access(p_topic_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_class UUID;
BEGIN
    SELECT class_id INTO v_class FROM public.topics WHERE id = p_topic_id;
    IF v_class IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1
        FROM public.class_pass_holders h
        JOIN public.class_pass_items i ON i.pass_id = h.pass_id
        WHERE h.user_id = (SELECT auth.uid())
          AND h.class_id = v_class
          AND (
            i.topic_id = p_topic_id
            OR i.subtopic_id IN (SELECT id FROM public.subtopics WHERE topic_id = p_topic_id)
            OR (i.video_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.video_placements vp
                  WHERE vp.video_id = i.video_id
                    AND (vp.topic_id = p_topic_id
                         OR vp.subtopic_id IN (SELECT id FROM public.subtopics WHERE topic_id = p_topic_id))))
            OR (i.resource_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.resource_placements rp
                  WHERE rp.resource_id = i.resource_id
                    AND (rp.topic_id = p_topic_id
                         OR rp.subtopic_id IN (SELECT id FROM public.subtopics WHERE topic_id = p_topic_id))))
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.scoped_topic_access(UUID) IS 'Access Pass check for a topic row: TRUE when one of the caller''s held passes (in the topic''s class) grants the topic itself, a subtopic under it, or a video / note item placed within it — i.e. the topic is either granted or must be revealed as the ancestor of a granted item so the curriculum can render around it. SECURITY DEFINER, empty search_path; probes only the caller''s (tiny) grant set via indexed EXISTS.';

CREATE OR REPLACE FUNCTION internal.scoped_subtopic_access(p_subtopic_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_topic_id UUID;
    v_class UUID;
BEGIN
    SELECT s.topic_id, t.class_id INTO v_topic_id, v_class
    FROM public.subtopics s
    JOIN public.topics t ON t.id = s.topic_id
    WHERE s.id = p_subtopic_id;
    IF v_class IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1
        FROM public.class_pass_holders h
        JOIN public.class_pass_items i ON i.pass_id = h.pass_id
        WHERE h.user_id = (SELECT auth.uid())
          AND h.class_id = v_class
          AND (
            i.topic_id = v_topic_id
            OR i.subtopic_id = p_subtopic_id
            OR (i.video_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.video_placements vp
                  WHERE vp.video_id = i.video_id AND vp.subtopic_id = p_subtopic_id))
            OR (i.resource_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.resource_placements rp
                  WHERE rp.resource_id = i.resource_id AND rp.subtopic_id = p_subtopic_id))
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.scoped_subtopic_access(UUID) IS 'Access Pass check for a subtopic row: TRUE when one of the caller''s held passes grants the parent topic (a topic grant covers its whole subtree), the subtopic itself, or a video / note item placed on the subtopic (revealing it as the ancestor of a granted item). SECURITY DEFINER, empty search_path.';

CREATE OR REPLACE FUNCTION internal.scoped_placement_access(p_topic_id UUID, p_subtopic_id UUID, p_video_id UUID, p_resource_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_class UUID;
    v_parent_topic UUID;
BEGIN
    v_class := internal.placement_class_id(p_topic_id, p_subtopic_id);
    IF v_class IS NULL THEN
        RETURN FALSE;
    END IF;
    v_parent_topic := COALESCE(p_topic_id,
        (SELECT topic_id FROM public.subtopics WHERE id = p_subtopic_id));
    RETURN EXISTS (
        SELECT 1
        FROM public.class_pass_holders h
        JOIN public.class_pass_items i ON i.pass_id = h.pass_id
        WHERE h.user_id = (SELECT auth.uid())
          AND h.class_id = v_class
          AND (
            i.topic_id = v_parent_topic
            OR (p_subtopic_id IS NOT NULL AND i.subtopic_id = p_subtopic_id)
            OR (p_video_id IS NOT NULL AND i.video_id = p_video_id)
            OR (p_resource_id IS NOT NULL AND i.resource_id = p_resource_id)
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.scoped_placement_access(UUID, UUID, UUID, UUID) IS 'The single downward Access Pass check shared by both placement tables and by the amended video_in_user_classes / resource_in_user_classes: given a placement''s polymorphic parent (topic XOR subtopic) plus the placed item id, TRUE when one of the caller''s held passes grants the ancestor topic, the exact subtopic, or the library item itself. Item grants are keyed by library-item id (not placement id) so they survive drag-and-drop placement churn. SECURITY DEFINER, empty search_path, fully-qualified references.';

CREATE OR REPLACE FUNCTION internal.holds_class_pass(p_pass_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.class_pass_holders
        WHERE pass_id = p_pass_id AND user_id = (SELECT auth.uid())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.holds_class_pass(UUID) IS 'TRUE when the caller holds the given pass (a class_pass_holders row exists; served by idx_class_pass_holders_pass_user). Used by the announcements select policy (targeted-audience gate) and the class_passes select policy (so a holder can read the name of a pass they hold). SECURITY DEFINER, empty search_path.';

CREATE OR REPLACE FUNCTION internal.pass_class_id(p_pass_id UUID)
RETURNS UUID AS $$
DECLARE
    v_class_id UUID;
BEGIN
    SELECT class_id INTO v_class_id FROM public.class_passes WHERE id = p_pass_id;
    RETURN v_class_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.pass_class_id(UUID) IS 'Resolves a pass to its class — the placement_class_id analogue for the Access Pass model — so the class_pass_items / class_pass_holders policies (and the pass-aware RPCs) never read class_passes under RLS (no recursion, no double policy evaluation). SECURITY DEFINER, empty search_path.';

CREATE OR REPLACE FUNCTION internal.video_visible_in_class(p_video_id UUID, p_class_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF p_class_id IN (SELECT internal.get_full_access_class_ids()) THEN
        RETURN TRUE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.video_placements vp
        WHERE vp.video_id = p_video_id
          AND internal.placement_class_id(vp.topic_id, vp.subtopic_id) = p_class_id
          AND internal.scoped_placement_access(vp.topic_id, vp.subtopic_id, vp.video_id, NULL)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.video_visible_in_class(UUID, UUID) IS 'Class-scoped "can the caller consume this video IN THIS CLASS" — used by the four forum select policies to gate video_qa thread visibility, so a Q&A thread is visible only where the caller actually has the video. Distinct from the amended video_in_user_classes, which answers "in ANY of my classes": the forum needs the per-class answer so a video the student can see in a DIFFERENT class they hold full access to does not reveal THIS class''s Q&A. SECURITY DEFINER, empty search_path, fully-qualified references.';

/* ==========  4. AMENDED HELPERS (same names, scope-aware semantics)  ========== */

CREATE OR REPLACE FUNCTION internal.video_in_user_classes(p_video_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.video_placements vp
        WHERE vp.video_id = p_video_id
          AND (
            internal.placement_class_id(vp.topic_id, vp.subtopic_id) IN (SELECT internal.get_full_access_class_ids())
            OR internal.scoped_placement_access(vp.topic_id, vp.subtopic_id, vp.video_id, NULL)
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.video_in_user_classes(UUID) IS 'Bypasses RLS to check whether a library video is placed somewhere the caller may actually CONSUME it: either in a class where they hold full access (full enrollment or teaching, via internal.get_full_access_class_ids) or through an Access Pass grant covering that placement (internal.scoped_placement_access). Used by videos_select_authorized so the videos policy never reads video_placements under RLS — the other half of the fix that prevents the videos <-> video_placements policy recursion (Postgres 42P17) — and so every downstream consumer of the videos row (lesson page, token mint, continue-watching) inherits scope enforcement for free. SECURITY DEFINER with empty search_path and fully-qualified references neutralises object-shadowing.';

CREATE OR REPLACE FUNCTION internal.resource_in_user_classes(p_resource_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.resource_placements rp
        WHERE rp.resource_id = p_resource_id
          AND (
            internal.placement_class_id(rp.topic_id, rp.subtopic_id) IN (SELECT internal.get_full_access_class_ids())
            OR internal.scoped_placement_access(rp.topic_id, rp.subtopic_id, NULL, rp.resource_id)
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.resource_in_user_classes(UUID) IS 'Bypasses RLS to check whether a library note is placed somewhere the caller may actually CONSUME it: either in a class where they hold full access (full enrollment or teaching, via internal.get_full_access_class_ids) or through an Access Pass grant covering that placement (internal.scoped_placement_access). Used by resources_select_authorized so the resources policy never reads resource_placements under RLS — mirrors internal.video_in_user_classes and prevents the resources <-> resource_placements recursion (Postgres 42P17). The /api/resources/[id]/download route inherits scope enforcement through this helper with zero code change.';

/* ==========  5. CLASS ENROLLMENTS: access_scope + immutability trigger  ========== */

ALTER TABLE public.class_enrollments
    ADD COLUMN IF NOT EXISTS access_scope public.enrollment_access DEFAULT 'full'::public.enrollment_access NOT NULL;

COMMENT ON TABLE public.class_enrollments IS 'Resolves the many-to-many relationship between users and classes. Membership identity (user_id, class_id, enrolled_at) stays immutable — locked by enforce_immutability_class_enrollments; only access_scope is mutable, by the class educator or an admin (enrollments_update_educator_or_admin), so a trial student can be upgraded in place without losing progress, forum history, or read receipts.';
COMMENT ON COLUMN public.class_enrollments.access_scope IS 'The enrollment''s content perimeter. full (default — every pre-existing writer is untouched): the student sees the whole curriculum, today''s behavior. scoped: FAIL-CLOSED explicit marker — the student sees exactly the union of the Access Passes they hold (class_pass_holders); if every held pass is deleted they see an empty curriculum (plus broadcast announcements + forum), never silently-full access. Not derived from the existence of holder rows by design.';

DROP TRIGGER IF EXISTS enforce_immutability_class_enrollments ON public.class_enrollments;
CREATE TRIGGER enforce_immutability_class_enrollments
    BEFORE UPDATE ON public.class_enrollments
    FOR EACH ROW EXECUTE PROCEDURE internal.protect_enrollment_columns();

/* ==========  6. CLASS PASSES  ========== */

CREATE TABLE IF NOT EXISTS public.class_passes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 80),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE public.class_passes IS 'A named, reusable Access Pass: a subset of one class''s curriculum (defined by class_pass_items) that an enrollment can be scoped to (via class_pass_holders + class_enrollments.access_scope = scoped). The pass is the first-class noun the educator names ("Trial — first 2 lessons", "Topics 1-3"), reuses across students, targets announcements at (announcements.pass_id), and mints scoped invite links for (class_invites.pass_id). Deleting a pass cascades its items, holders, scoped invites, and targeted announcements away — scoped students then fail closed to an empty curriculum, never silently-full access.';
COMMENT ON COLUMN public.class_passes.name IS 'Educator-facing label, unique per class case-insensitively (uniq_class_passes_class_name). Shown to holders on the class banner, targeted-announcement chips, and the invite landing page — the same trust surface as the class title.';
COMMENT ON COLUMN public.class_passes.created_by IS 'Issuer bookkeeping; ON DELETE SET NULL because the pass must keep working for its holders even if the creating account goes away.';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_class_passes_class_name ON public.class_passes(class_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_class_passes_class_id ON public.class_passes(class_id);
CREATE INDEX IF NOT EXISTS idx_class_passes_created_by ON public.class_passes(created_by);

DROP TRIGGER IF EXISTS set_class_passes_updated_at ON public.class_passes;
CREATE TRIGGER set_class_passes_updated_at
    BEFORE UPDATE ON public.class_passes
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS enforce_immutability_class_passes ON public.class_passes;
CREATE TRIGGER enforce_immutability_class_passes
    BEFORE UPDATE ON public.class_passes
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();

DROP TRIGGER IF EXISTS enforce_pass_reparent ON public.class_passes;
CREATE TRIGGER enforce_pass_reparent
    BEFORE UPDATE ON public.class_passes
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_pass_reparent();

/* ==========  7. CLASS INVITES: pass_id  ========== */

ALTER TABLE public.class_invites
    ADD COLUMN IF NOT EXISTS pass_id UUID REFERENCES public.class_passes(id) ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON COLUMN public.class_invites.pass_id IS 'NULL = full-access invite (the default, today''s behavior). Set = a SCOPED invite: redeeming enrolls the student with access_scope = scoped holding this pass. ON DELETE CASCADE (not SET NULL) is deliberate fail-closed design — SET NULL would silently escalate a trial invite into a full-access invite when the pass is deleted; cascade kills the outstanding link with the pass instead. Class membership of the pass is enforced by enforce_invite_pass_class.';

CREATE INDEX IF NOT EXISTS idx_class_invites_pass_id ON public.class_invites(pass_id);

DROP TRIGGER IF EXISTS enforce_invite_pass_class ON public.class_invites;
CREATE TRIGGER enforce_invite_pass_class
    BEFORE INSERT OR UPDATE ON public.class_invites
    FOR EACH ROW EXECUTE PROCEDURE internal.validate_invite_pass_class();

/* ==========  8. CLASS PASS ITEMS  ========== */

CREATE TABLE IF NOT EXISTS public.class_pass_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pass_id UUID NOT NULL REFERENCES public.class_passes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    subtopic_id UUID REFERENCES public.subtopics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE ON UPDATE CASCADE,
    resource_id UUID REFERENCES public.resources(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_pass_item_shape CHECK (
        (topic_id IS NOT NULL)::int + (subtopic_id IS NOT NULL)::int
        + (video_id IS NOT NULL)::int + (resource_id IS NOT NULL)::int = 1
    )
);
COMMENT ON TABLE public.class_pass_items IS 'What an Access Pass grants — polymorphic 4-way XOR rows (chk_pass_item_shape): a topic grant covers the topic, ALL its subtopics, and every placement under any of them (including content added later); a subtopic grant covers the subtopic and its placements (and reveals the parent topic row for rendering); a video / resource grant covers that LIBRARY ITEM wherever it is placed in this class (and reveals the ancestor rows). Item grants are deliberately keyed by library-item id, NOT video_placements.id — placements churn under the drag-and-drop board and a grant must survive that; a granted item whose last placement in the class is removed simply grants nothing (fail-closed dangling grant, harmless). Cross-class integrity is enforced by enforce_pass_item_class.';
COMMENT ON CONSTRAINT chk_pass_item_shape ON public.class_pass_items IS '4-way XOR: exactly one of topic_id / subtopic_id / video_id / resource_id is set per item row.';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pass_items_topic    ON public.class_pass_items(pass_id, topic_id)    WHERE topic_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pass_items_subtopic ON public.class_pass_items(pass_id, subtopic_id) WHERE subtopic_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pass_items_video    ON public.class_pass_items(pass_id, video_id)    WHERE video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pass_items_resource ON public.class_pass_items(pass_id, resource_id) WHERE resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pass_items_pass_id     ON public.class_pass_items(pass_id);
CREATE INDEX IF NOT EXISTS idx_pass_items_topic_id    ON public.class_pass_items(topic_id);
CREATE INDEX IF NOT EXISTS idx_pass_items_subtopic_id ON public.class_pass_items(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_pass_items_video_id    ON public.class_pass_items(video_id);
CREATE INDEX IF NOT EXISTS idx_pass_items_resource_id ON public.class_pass_items(resource_id);

DROP TRIGGER IF EXISTS enforce_pass_item_class ON public.class_pass_items;
CREATE TRIGGER enforce_pass_item_class
    BEFORE INSERT OR UPDATE ON public.class_pass_items
    FOR EACH ROW EXECUTE PROCEDURE internal.validate_pass_item_class();

DROP TRIGGER IF EXISTS enforce_immutability_class_pass_items ON public.class_pass_items;
CREATE TRIGGER enforce_immutability_class_pass_items
    BEFORE UPDATE ON public.class_pass_items
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();

/* ==========  9. CLASS PASS HOLDERS  ========== */

CREATE TABLE IF NOT EXISTS public.class_pass_holders (
    user_id UUID NOT NULL,
    class_id UUID NOT NULL,
    pass_id UUID NOT NULL REFERENCES public.class_passes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, class_id, pass_id),
    FOREIGN KEY (user_id, class_id)
        REFERENCES public.class_enrollments(user_id, class_id) ON DELETE CASCADE ON UPDATE CASCADE
);
COMMENT ON TABLE public.class_pass_holders IS 'Which enrollment holds which Access Pass. The composite FK to class_enrollments means unenrolling (or deleting the account / class) cascades holder rows away; deleting a pass cascades its holders — and the enrollment''s access_scope = scoped marker keeps the student FAIL-CLOSED (no silent full-access escalation). Holder rows are meaningful only while access_scope = scoped; on upgrade-to-full the writers delete them (a leftover would be inert while full but would resurrect on a later downgrade). Immutable join row (composite PK, no UPDATE policy — the announcement_reads / forum_post_upvotes pattern; change = delete + insert). Pass-class agreement is enforced by enforce_pass_holder_class.';
COMMENT ON COLUMN public.class_pass_holders.granted_by IS 'Who granted the pass (educator, admin, or the invite issuer via redeem_class_invite); ON DELETE SET NULL bookkeeping only.';

CREATE INDEX IF NOT EXISTS idx_class_pass_holders_pass_user ON public.class_pass_holders(pass_id, user_id);
CREATE INDEX IF NOT EXISTS idx_class_pass_holders_class_id  ON public.class_pass_holders(class_id);

DROP TRIGGER IF EXISTS enforce_pass_holder_class ON public.class_pass_holders;
CREATE TRIGGER enforce_pass_holder_class
    BEFORE INSERT ON public.class_pass_holders
    FOR EACH ROW EXECUTE PROCEDURE internal.validate_pass_holder_class();

/* ==========  10. ANNOUNCEMENTS: pass_id  ========== */

ALTER TABLE public.announcements
    ADD COLUMN IF NOT EXISTS pass_id UUID REFERENCES public.class_passes(id) ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON TABLE public.announcements IS 'Unidirectional broadcast payloads distributed from administrators/educators to enrolled users. pass_id NULL = broadcast to the whole class (the default); set = targeted at the holders of one Access Pass (plus the class educator / admins), enforced by the select policy.';
COMMENT ON COLUMN public.announcements.pass_id IS 'NULL = broadcast to the whole class (default — every pre-existing row stays broadcast). Set = visible only to the class educator, admins, and holders of that pass (announcements_select_authorized). ON DELETE CASCADE: a targeted announcement dies with its audience — an orphaned targeted message shown to nobody, or worse silently flipped to broadcast, would both be wrong. One pass per announcement in v1 (post once per pass for multi-audience). Class membership of the pass is enforced by enforce_announcement_pass_class; audience is create-time-only in the app (updateAnnouncementAction does not accept it).';

CREATE INDEX IF NOT EXISTS idx_announcements_pass_id ON public.announcements(pass_id);

DROP TRIGGER IF EXISTS enforce_announcement_pass_class ON public.announcements;
CREATE TRIGGER enforce_announcement_pass_class
    BEFORE INSERT OR UPDATE ON public.announcements
    FOR EACH ROW EXECUTE PROCEDURE internal.validate_announcement_pass_class();

/* ==========  11. AMENDED RPCS  ==========
   get_class_invite_preview changes its OUT-table shape and
   educator_enroll_student_by_email changes its signature, so both need an
   explicit DROP FUNCTION before recreation, with their REVOKE / GRANT pairs
   re-appended after (grants do not survive a drop). redeem_class_invite
   keeps its signature — CREATE OR REPLACE preserves its ACL. */

CREATE OR REPLACE FUNCTION public.redeem_class_invite(p_token TEXT)
RETURNS UUID AS $$
DECLARE
    v_uid       UUID := (SELECT auth.uid());
    v_invite    public.class_invites%ROWTYPE;
    v_educator  UUID;
    v_caller_email TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH REQUIRED: Sign in to accept this invite.';
    END IF;

    SELECT * INTO v_invite FROM public.class_invites WHERE token = p_token FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This invite link is not valid.';
    END IF;
    IF v_invite.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'This invite has been revoked.';
    END IF;
    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at <= NOW() THEN
        RAISE EXCEPTION 'This invite has expired.';
    END IF;

    /* Idempotent: the same user re-opening their already-redeemed link just lands in the class. */
    IF v_invite.redeemed_at IS NOT NULL THEN
        IF v_invite.redeemed_by = v_uid THEN
            IF v_invite.pass_id IS NOT NULL THEN
                INSERT INTO public.class_enrollments (user_id, class_id, access_scope)
                VALUES (v_uid, v_invite.class_id, 'scoped'::public.enrollment_access)
                ON CONFLICT (user_id, class_id) DO NOTHING;
                INSERT INTO public.class_pass_holders (user_id, class_id, pass_id, granted_by)
                VALUES (v_uid, v_invite.class_id, v_invite.pass_id, v_invite.created_by)
                ON CONFLICT (user_id, class_id, pass_id) DO NOTHING;
            ELSE
                INSERT INTO public.class_enrollments (user_id, class_id)
                VALUES (v_uid, v_invite.class_id)
                ON CONFLICT (user_id, class_id) DO UPDATE SET access_scope = 'full'::public.enrollment_access;
                DELETE FROM public.class_pass_holders
                WHERE user_id = v_uid AND class_id = v_invite.class_id;
            END IF;
            RETURN v_invite.class_id;
        END IF;
        RAISE EXCEPTION 'This invite has already been used.';
    END IF;

    /* Optional email binding. */
    IF v_invite.email IS NOT NULL THEN
        SELECT email INTO v_caller_email FROM auth.users WHERE id = v_uid;
        IF LOWER(v_caller_email) IS DISTINCT FROM LOWER(v_invite.email) THEN
            RAISE EXCEPTION 'This invite was issued for a different email address.';
        END IF;
    END IF;

    SELECT educator_id INTO v_educator FROM public.classes WHERE id = v_invite.class_id;
    IF v_educator = v_uid THEN
        RAISE EXCEPTION 'You teach this class — you cannot enrol as a student.';
    END IF;

    IF v_invite.pass_id IS NOT NULL THEN
        /* Scoped invite: enroll scoped; NEVER downgrade an existing enrollment. */
        INSERT INTO public.class_enrollments (user_id, class_id, access_scope)
        VALUES (v_uid, v_invite.class_id, 'scoped'::public.enrollment_access)
        ON CONFLICT (user_id, class_id) DO NOTHING;
        INSERT INTO public.class_pass_holders (user_id, class_id, pass_id, granted_by)
        VALUES (v_uid, v_invite.class_id, v_invite.pass_id, v_invite.created_by)
        ON CONFLICT (user_id, class_id, pass_id) DO NOTHING;
    ELSE
        /* Full invite: enroll full; UPGRADES an existing scoped enrollment (the invite is an
           explicit educator grant — this is the trial-to-paid manual upgrade path via link). */
        INSERT INTO public.class_enrollments (user_id, class_id)
        VALUES (v_uid, v_invite.class_id)
        ON CONFLICT (user_id, class_id) DO UPDATE SET access_scope = 'full'::public.enrollment_access;
        DELETE FROM public.class_pass_holders
        WHERE user_id = v_uid AND class_id = v_invite.class_id;
    END IF;

    UPDATE public.class_invites
    SET redeemed_by = v_uid, redeemed_at = NOW()
    WHERE id = v_invite.id;

    RETURN v_invite.class_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.redeem_class_invite(TEXT) IS 'The manual-payment enrollment writer. Validates the secret invite token (exists, not revoked, not expired), enforces single use (idempotent for the same caller — re-opening a redeemed link just re-lands them in the class; anyone else is rejected), honors the optional email binding against auth.users, and blocks the class educator from self-enrolling, then inserts the class_enrollments row and stamps redeemed_by / redeemed_at. Access Pass aware: a scoped invite (pass_id set) enrolls with access_scope = scoped and adds the class_pass_holders row, NEVER downgrading an existing enrollment (ON CONFLICT DO NOTHING); a full invite (pass_id NULL) enrolls full and UPGRADES an existing scoped enrollment in place (ON CONFLICT DO UPDATE), clearing the student''s holder rows — the deliberate trial-to-paid link upgrade path. The same branch applies on the idempotent same-redeemer re-open. SECURITY DEFINER bypasses the admin/educator-only insert policy on class_enrollments (the holder-row write is likewise sanctioned), exactly like enroll_in_free_class. Deliberately does NOT require is_published or price_cents = 0 — the invite is an explicit grant for an externally-paid (possibly draft) class. SELECT ... FOR UPDATE locks the invite row so two concurrent redeems cannot both win the single use. Returns the class_id for the post-join redirect.';

REVOKE EXECUTE ON FUNCTION public.redeem_class_invite(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.redeem_class_invite(TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.get_class_invite_preview(TEXT);

CREATE OR REPLACE FUNCTION public.get_class_invite_preview(p_token TEXT)
RETURNS TABLE (class_id UUID, class_title TEXT, educator_name TEXT, redeemable BOOLEAN, reason TEXT, pass_name TEXT)
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.title,
        COALESCE(NULLIF(TRIM(COALESCE(pp.display_name, CONCAT_WS(' ', pp.first_name, pp.last_name))), ''), 'An educator'),
        (ci.revoked_at IS NULL
            AND ci.redeemed_at IS NULL
            AND (ci.expires_at IS NULL OR ci.expires_at > NOW())),
        CASE
            WHEN ci.revoked_at IS NOT NULL THEN 'revoked'
            WHEN ci.redeemed_at IS NOT NULL THEN 'redeemed'
            WHEN ci.expires_at IS NOT NULL AND ci.expires_at <= NOW() THEN 'expired'
            ELSE 'valid'
        END,
        cp.name
    FROM public.class_invites ci
    JOIN public.classes c ON c.id = ci.class_id
    LEFT JOIN public.profiles_public pp ON pp.id = c.educator_id
    LEFT JOIN public.class_passes cp ON cp.id = ci.pass_id
    WHERE ci.token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.get_class_invite_preview(TEXT) IS 'Public (anon-callable) read boundary for the invite landing page: given the secret token, returns the class title, the educator''s display name, whether the invite is still redeemable (with a reason of revoked / redeemed / expired / valid), and the audience pass name (pass_name; NULL = full-access invite). Leaks nothing beyond the title + name + pass label — never email, note, or issuer — and returns zero rows for unknown tokens, so there is no existence oracle without holding the 192-bit secret. The pass name is the same trust surface as the class title (revealed only to secret-holders). SECURITY DEFINER with empty search_path; the WHERE clause and column list ARE the boundary, following the get_public_educator_profile pattern.';

REVOKE EXECUTE ON FUNCTION public.get_class_invite_preview(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_class_invite_preview(TEXT) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.educator_enroll_student_by_email(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.educator_enroll_student_by_email(p_class_id UUID, p_email TEXT, p_pass_id UUID DEFAULT NULL)
RETURNS TABLE (status TEXT, student_id UUID, student_name TEXT)
AS $$
DECLARE
    v_uid    UUID := (SELECT auth.uid());
    v_target UUID;
    v_role   public.user_role;
    v_name   TEXT;
    v_exists BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH REQUIRED: Sign in to manage the roster.';
    END IF;

    IF NOT ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(p_class_id))) THEN
        RAISE EXCEPTION 'Only the class educator or an admin may add students to this class.';
    END IF;

    IF p_pass_id IS NOT NULL AND internal.pass_class_id(p_pass_id) IS DISTINCT FROM p_class_id THEN
        RAISE EXCEPTION 'The selected pass does not belong to this class.';
    END IF;

    SELECT u.id INTO v_target
    FROM auth.users u
    WHERE LOWER(u.email) = LOWER(TRIM(p_email))
    LIMIT 1;

    IF v_target IS NULL THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_target;

    IF v_role IS DISTINCT FROM 'student'::public.user_role THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    SELECT COALESCE(
             NULLIF(TRIM(COALESCE(pp.display_name, CONCAT_WS(' ', pp.first_name, pp.last_name))), ''),
             'Student')
    INTO v_name
    FROM public.profiles_public pp
    WHERE pp.id = v_target;

    SELECT EXISTS (
        SELECT 1 FROM public.class_enrollments ce
        WHERE ce.user_id = v_target AND ce.class_id = p_class_id
    ) INTO v_exists;

    IF v_exists THEN
        RETURN QUERY SELECT 'already_enrolled'::TEXT, v_target, v_name;
        RETURN;
    END IF;

    IF p_pass_id IS NOT NULL THEN
        INSERT INTO public.class_enrollments (user_id, class_id, access_scope)
        VALUES (v_target, p_class_id, 'scoped'::public.enrollment_access)
        ON CONFLICT (user_id, class_id) DO NOTHING;
        INSERT INTO public.class_pass_holders (user_id, class_id, pass_id, granted_by)
        VALUES (v_target, p_class_id, p_pass_id, v_uid)
        ON CONFLICT (user_id, class_id, pass_id) DO NOTHING;
    ELSE
        INSERT INTO public.class_enrollments (user_id, class_id)
        VALUES (v_target, p_class_id)
        ON CONFLICT (user_id, class_id) DO NOTHING;
    END IF;

    RETURN QUERY SELECT 'enrolled'::TEXT, v_target, v_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.educator_enroll_student_by_email(UUID, TEXT, UUID) IS 'Educator/admin roster writer: resolves an email to a student user id (a step the class educator cannot do under RLS, since they cannot read auth.users / other profiles) and enrolls them into the given class. SECURITY DEFINER bypasses the admin/educator-only insert policy on class_enrollments, like enroll_in_free_class. Authorizes the caller as admin OR the class educator (a true EXCEPTION otherwise). Missing user and non-student role are collapsed into a single not_found status so the class owner cannot probe for educator/admin account emails (a residual student-email oracle for the owner is accepted, matching the invite-preview trust surface). Access Pass aware: an optional p_pass_id (validated to belong to p_class_id via internal.pass_class_id) makes a NEW enrollment scoped and adds the class_pass_holders row; already_enrolled returns unchanged and touches NOTHING — scope edits for existing students happen only in the roster access editor, never as a side effect of a duplicate add. Deliberately skips the is_published / price_cents checks — an explicit educator grant for a possibly-draft class, like redeem_class_invite. Does NOT touch user_video_progress (keyed by user+video, not enrollment), so re-adding a student restores their prior progress view. Returns status (enrolled | already_enrolled | not_found), the student id, and their display name.';

REVOKE EXECUTE ON FUNCTION public.educator_enroll_student_by_email(UUID, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.educator_enroll_student_by_email(UUID, TEXT, UUID) TO authenticated;

/* ==========  12. RLS: ACTIVATION FOR THE NEW TABLES  ========== */

ALTER TABLE public.class_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_pass_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_pass_holders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.class_passes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.class_pass_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.class_pass_holders FORCE ROW LEVEL SECURITY;

/* ==========  13. RLS: NEW POLICIES  ========== */

DROP POLICY IF EXISTS enrollments_update_educator_or_admin ON public.class_enrollments;
CREATE POLICY enrollments_update_educator_or_admin ON public.class_enrollments
    FOR UPDATE TO authenticated
    USING ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(class_id)))
    WITH CHECK ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(class_id)));
COMMENT ON POLICY enrollments_update_educator_or_admin ON public.class_enrollments IS 'The table''s first (and only) UPDATE policy, added for the Access Pass model: the class educator or an admin flips access_scope (full <-> scoped) in place, so a trial upgrade never deletes and re-creates the enrollment. Students can never touch their own scope; the identity columns (user_id, class_id, enrolled_at) are locked by the enforce_immutability_class_enrollments trigger.';

DROP POLICY IF EXISTS class_passes_select_authorized ON public.class_passes;
CREATE POLICY class_passes_select_authorized ON public.class_passes
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR (SELECT internal.is_class_educator(class_id))
        OR (SELECT internal.holds_class_pass(id))
    );
COMMENT ON POLICY class_passes_select_authorized ON public.class_passes IS 'The class educator and admins manage passes; the holder-select branch lets a scoped student read the NAME of a pass they hold (the "Trial access" banner chip and the PostgREST class_passes(name) embed on targeted announcements). Name + description only by column discipline in queries; the row carries nothing sensitive.';

DROP POLICY IF EXISTS class_passes_insert_educator_or_admin ON public.class_passes;
CREATE POLICY class_passes_insert_educator_or_admin ON public.class_passes
    FOR INSERT TO authenticated
    WITH CHECK (
        created_by = (SELECT auth.uid())
        AND ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(class_id)))
    );
COMMENT ON POLICY class_passes_insert_educator_or_admin ON public.class_passes IS 'Only the educator of the target class or an admin may create a pass, and the issuer must stamp themselves as created_by (mirroring class_invites_insert_owner_or_admin).';

DROP POLICY IF EXISTS class_passes_update_educator_or_admin ON public.class_passes;
CREATE POLICY class_passes_update_educator_or_admin ON public.class_passes
    FOR UPDATE TO authenticated
    USING ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(class_id)))
    WITH CHECK ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(class_id)));
COMMENT ON POLICY class_passes_update_educator_or_admin ON public.class_passes IS 'Class educator or admin renames / re-describes a pass. class_id is locked by the enforce_pass_reparent trigger, so an update can never move a pass (and its holders / targeted announcements) to another class.';

DROP POLICY IF EXISTS class_passes_delete_educator_or_admin ON public.class_passes;
CREATE POLICY class_passes_delete_educator_or_admin ON public.class_passes
    FOR DELETE TO authenticated
    USING ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(class_id)));
COMMENT ON POLICY class_passes_delete_educator_or_admin ON public.class_passes IS 'Class educator or admin deletes a pass; items, holders, scoped invites, and targeted announcements cascade away, and scoped holders fail closed to an empty curriculum (the manage UI warns with the holder count first).';

DROP POLICY IF EXISTS class_pass_items_select_owner_or_admin ON public.class_pass_items;
CREATE POLICY class_pass_items_select_owner_or_admin ON public.class_pass_items
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR (SELECT internal.is_class_educator(internal.pass_class_id(pass_id)))
    );
COMMENT ON POLICY class_pass_items_select_owner_or_admin ON public.class_pass_items IS 'Educator/admin management surface only — students never query this table; the curriculum RLS (topics / subtopics / placements select policies via the scoped_* helpers) does the filtering for them. Class resolves through internal.pass_class_id so this policy never reads class_passes under RLS.';

DROP POLICY IF EXISTS class_pass_items_modify_owner_or_admin ON public.class_pass_items;
CREATE POLICY class_pass_items_modify_owner_or_admin ON public.class_pass_items
    FOR ALL TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR (SELECT internal.is_class_educator(internal.pass_class_id(pass_id)))
    );
COMMENT ON POLICY class_pass_items_modify_owner_or_admin ON public.class_pass_items IS 'The class educator (resolved via internal.pass_class_id, never reading class_passes under RLS) or an admin reconciles a pass''s item set. FOR ALL with USING only, matching the curriculum-modify convention; the enforce_pass_item_class trigger is the cross-class integrity backstop.';

DROP POLICY IF EXISTS class_pass_holders_select_authorized ON public.class_pass_holders;
CREATE POLICY class_pass_holders_select_authorized ON public.class_pass_holders
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR user_id = (SELECT auth.uid())
        OR (SELECT internal.is_class_educator(class_id))
    );
COMMENT ON POLICY class_pass_holders_select_authorized ON public.class_pass_holders IS 'A student sees their own held passes (drives the scoped-access banner); the class educator sees the roster''s holders (drives the access chips); admins see all.';

DROP POLICY IF EXISTS class_pass_holders_insert_educator_or_admin ON public.class_pass_holders;
CREATE POLICY class_pass_holders_insert_educator_or_admin ON public.class_pass_holders
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(class_id)));
COMMENT ON POLICY class_pass_holders_insert_educator_or_admin ON public.class_pass_holders IS 'Only the class educator or an admin grants a pass directly; students acquire passes through the redeem_class_invite SECURITY DEFINER RPC. The enforce_pass_holder_class trigger pins the pass to the row''s class.';

DROP POLICY IF EXISTS class_pass_holders_delete_educator_or_admin ON public.class_pass_holders;
CREATE POLICY class_pass_holders_delete_educator_or_admin ON public.class_pass_holders
    FOR DELETE TO authenticated
    USING ((SELECT internal.is_admin()) OR (SELECT internal.is_class_educator(class_id)));
COMMENT ON POLICY class_pass_holders_delete_educator_or_admin ON public.class_pass_holders IS 'Class educator or admin revokes a held pass (the access editor''s reconcile). No UPDATE policy — an immutable join row like announcement_reads; change = delete + insert.';

/* ==========  14. RLS: REPLACED SELECT POLICIES (content perimeter + Q&A gate)  ========== */

DROP POLICY IF EXISTS topics_select_authorized ON public.topics;
CREATE POLICY topics_select_authorized ON public.topics
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR class_id IN (SELECT internal.get_full_access_class_ids())
        OR (SELECT internal.scoped_topic_access(topics.id))
    );
COMMENT ON POLICY topics_select_authorized ON public.topics IS 'The CONTENT perimeter: admins and full-access members (full enrollment or teaching educator, via internal.get_full_access_class_ids) see every topic; scoped enrollments see only topics their Access Passes grant or that must render as the ancestor of a granted item (internal.scoped_topic_access). For a user with zero holder rows the scoped branch is a single empty index probe.';

DROP POLICY IF EXISTS subtopics_select_authorized ON public.subtopics;
CREATE POLICY subtopics_select_authorized ON public.subtopics
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.topics t
            WHERE t.id = subtopics.topic_id
              AND t.class_id IN (SELECT internal.get_full_access_class_ids())
        )
        OR (SELECT internal.scoped_subtopic_access(subtopics.id))
    );
COMMENT ON POLICY subtopics_select_authorized ON public.subtopics IS 'The CONTENT perimeter one level down: full-access members (via the parent topic''s class) see every subtopic; scoped enrollments see only subtopics their Access Passes grant — directly, via a parent-topic grant, or as the ancestor of a granted item (internal.scoped_subtopic_access).';

DROP POLICY IF EXISTS video_placements_select_authorized ON public.video_placements;
CREATE POLICY video_placements_select_authorized ON public.video_placements
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR (SELECT internal.placement_class_id(video_placements.topic_id, video_placements.subtopic_id))
             IN (SELECT internal.get_full_access_class_ids())
        OR (SELECT internal.scoped_placement_access(video_placements.topic_id, video_placements.subtopic_id, video_placements.video_id, NULL))
    );
COMMENT ON POLICY video_placements_select_authorized ON public.video_placements IS 'A placement is visible to admins, full-access members of its class (full enrollment or teaching educator, via internal.get_full_access_class_ids), or a scoped enrollment whose Access Pass covers it — the ancestor topic, the exact subtopic, or the placed video itself (internal.scoped_placement_access). Drives curriculum rendering for students and educators.';

DROP POLICY IF EXISTS resource_placements_select_authorized ON public.resource_placements;
CREATE POLICY resource_placements_select_authorized ON public.resource_placements
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR (SELECT internal.placement_class_id(resource_placements.topic_id, resource_placements.subtopic_id))
             IN (SELECT internal.get_full_access_class_ids())
        OR (SELECT internal.scoped_placement_access(resource_placements.topic_id, resource_placements.subtopic_id, NULL, resource_placements.resource_id))
    );
COMMENT ON POLICY resource_placements_select_authorized ON public.resource_placements IS 'A note placement is visible to admins, full-access members of its class, or a scoped enrollment whose Access Pass covers it — the ancestor topic, the exact subtopic, or the placed note itself (internal.scoped_placement_access). Drives curriculum rendering. Mirrors video_placements_select_authorized.';

DROP POLICY IF EXISTS announcements_select_authorized ON public.announcements;
CREATE POLICY announcements_select_authorized ON public.announcements
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR (
            class_id IN (SELECT internal.get_user_class_ids())
            AND (
                pass_id IS NULL
                OR (SELECT internal.is_class_educator(class_id))
                OR (SELECT internal.holds_class_pass(pass_id))
            )
        )
    );
COMMENT ON POLICY announcements_select_authorized ON public.announcements IS 'Membership perimeter plus the targeted-audience gate: broadcast announcements (pass_id NULL) are visible to every class member exactly as before; a targeted announcement is visible only to the class educator, admins, and holders of that exact pass — a FULL student does NOT see trial-targeted messages, and holders of a different pass do not either. Read receipts, unread badges, and the realtime subscription are all RLS-filtered reads of this table, so they adapt with zero query changes.';

DROP POLICY IF EXISTS forum_posts_select_authorized ON public.forum_posts;
CREATE POLICY forum_posts_select_authorized ON public.forum_posts
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR (
            class_id IN (SELECT internal.get_user_class_ids())
            AND (
                type <> 'video_qa'::public.forum_post_type
                OR video_id IS NULL
                OR (SELECT internal.video_visible_in_class(video_id, class_id))
            )
        )
    );
COMMENT ON POLICY forum_posts_select_authorized ON public.forum_posts IS 'Membership perimeter (general discussion stays class-wide — scoped students remain full community members) plus the lesson Q&A gate: a video_qa thread is visible only to members who can actually consume its video IN THIS CLASS (internal.video_visible_in_class), so a scoped student never sees Q&A about non-granted lessons. The helper is invoked only for video_qa rows, after the cheaper type / video_id / membership predicates, so general-post and full-student hot paths are unchanged.';

DROP POLICY IF EXISTS forum_replies_select_authorized ON public.forum_replies;
CREATE POLICY forum_replies_select_authorized ON public.forum_replies
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.forum_posts fp
            WHERE fp.id = forum_replies.post_id
              AND fp.class_id IN (SELECT internal.get_user_class_ids())
              AND (
                  fp.type <> 'video_qa'::public.forum_post_type
                  OR fp.video_id IS NULL
                  OR (SELECT internal.video_visible_in_class(fp.video_id, fp.class_id))
              )
        )
    );
COMMENT ON POLICY forum_replies_select_authorized ON public.forum_replies IS 'Resolves reply visibility dynamically by validating access to the parent post context, including the lesson Q&A scope gate (internal.video_visible_in_class) — applied here explicitly, belt-and-suspenders with the parent forum_posts policy, so reply visibility never depends on RLS-in-policy-subquery cascade semantics.';

DROP POLICY IF EXISTS forum_post_upvotes_select_authorized ON public.forum_post_upvotes;
CREATE POLICY forum_post_upvotes_select_authorized ON public.forum_post_upvotes
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.forum_posts fp
            WHERE fp.id = forum_post_upvotes.post_id
              AND fp.class_id IN (SELECT internal.get_user_class_ids())
              AND (
                  fp.type <> 'video_qa'::public.forum_post_type
                  OR fp.video_id IS NULL
                  OR (SELECT internal.video_visible_in_class(fp.video_id, fp.class_id))
              )
        )
    );
COMMENT ON POLICY forum_post_upvotes_select_authorized ON public.forum_post_upvotes IS 'Mirrors forum post visibility — endorsements are visible only to users authorised to access the parent post context, including the lesson Q&A scope gate (internal.video_visible_in_class), applied explicitly on all four forum select policies.';

DROP POLICY IF EXISTS forum_reply_upvotes_select_authorized ON public.forum_reply_upvotes;
CREATE POLICY forum_reply_upvotes_select_authorized ON public.forum_reply_upvotes
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.forum_replies fr
            JOIN public.forum_posts fp ON fp.id = fr.post_id
            WHERE fr.id = forum_reply_upvotes.reply_id
              AND fp.class_id IN (SELECT internal.get_user_class_ids())
              AND (
                  fp.type <> 'video_qa'::public.forum_post_type
                  OR fp.video_id IS NULL
                  OR (SELECT internal.video_visible_in_class(fp.video_id, fp.class_id))
              )
        )
    );
COMMENT ON POLICY forum_reply_upvotes_select_authorized ON public.forum_reply_upvotes IS 'Mirrors reply visibility — endorsements are visible only to users authorised to access the parent post''s class context, including the lesson Q&A scope gate (internal.video_visible_in_class), applied explicitly on all four forum select policies.';
