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

CREATE OR REPLACE FUNCTION internal.set_forum_reply_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.set_forum_reply_updated_at() IS 'Reply analogue of set_forum_post_updated_at. Skips the timestamp bump when fired inside a nested trigger chain (the forum_reply_upvotes ledger maintenance), so comment endorsements never mark a reply as edited. User-issued content edits and soft-deletes arrive at depth 1 and bump updated_at.';

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

CREATE OR REPLACE FUNCTION internal.maintain_forum_reply_upvote_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_replies SET upvotes = upvotes + 1 WHERE id = NEW.reply_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.forum_replies SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = OLD.reply_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.maintain_forum_reply_upvote_count() IS 'Reply analogue of maintain_forum_post_upvote_count. Keeps forum_replies.upvotes in lockstep with the forum_reply_upvotes ledger. SECURITY DEFINER (empty search_path, fully-qualified references) so the upvoter can mutate the counter despite forum_replies RLS.';

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
        IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned AND NOT internal.is_class_educator(OLD.class_id) THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Only the class educator or an admin can pin or unpin a thread.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_forum_post_ownership() IS 'Prevents users (incl. the post author) from tampering with a forum post''s authorship, class association, or pin state. The pin flag is reserved to the class educator (internal.is_class_educator) or an admin; authorship/class moves are admin-only.';

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

CREATE OR REPLACE FUNCTION internal.protect_forum_reply_upvotes()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.upvotes IS DISTINCT FROM OLD.upvotes AND NOT internal.is_admin() THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Direct manipulation of reply upvote counts is prohibited. Insert into forum_reply_upvotes instead.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_forum_reply_upvotes() IS 'Reply analogue of protect_forum_post_upvotes. Hard-rejects direct UPDATEs to the denormalized forum_replies.upvotes column by non-admins; legitimate changes flow through the forum_reply_upvotes ledger and are detected via pg_trigger_depth().';

CREATE OR REPLACE FUNCTION internal.protect_forum_reply_integrity()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;
    IF NOT internal.is_admin() THEN
        IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Reply authorship cannot be reassigned.';
        END IF;
        IF NEW.post_id IS DISTINCT FROM OLD.post_id OR NEW.parent_reply_id IS DISTINCT FROM OLD.parent_reply_id THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Replies cannot be moved between threads.';
        END IF;
        IF NEW.content IS DISTINCT FROM OLD.content
           AND OLD.author_id <> auth.uid()
           AND NOT (OLD.is_deleted = FALSE AND NEW.is_deleted = TRUE) THEN
            RAISE EXCEPTION 'SECURITY VIOLATION: Only the author may edit a reply (moderators may only remove it).';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION internal.protect_forum_reply_integrity() IS 'Anti-tampering guard for forum_replies UPDATEs. Non-admins cannot reassign authorship or move a reply to another thread/parent, and may not rewrite a body that is not their own — except a class educator (or the author) may blank the content while tombstoning it (is_deleted false -> true), which backs the soft-delete moderation path. Depth-guarded so the upvote-ledger maintenance write passes.';

CREATE OR REPLACE FUNCTION internal.validate_forum_post_video_class()
RETURNS TRIGGER AS $$
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

    IF NOT EXISTS (
        SELECT 1
        FROM public.video_placements vp
        WHERE vp.video_id = NEW.video_id
          AND internal.placement_class_id(vp.topic_id, vp.subtopic_id) = NEW.class_id
    ) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: forum_posts.video_id must reference a video placed in the same class as the post (post class %).', NEW.class_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION internal.validate_forum_post_video_class() IS 'Closes the cross-class loophole left open by chk_forum_post_video_context under the video-library model: when a post references a video, that video must have a video_placements row (topic- or subtopic-level) resolving to the post''s class via internal.placement_class_id. CHECK constraints cannot reach across tables, hence the trigger. The UPDATE-path early-exit is wrapped in a nested IF (rather than a single conjoined expression) because PostgreSQL does not guarantee short-circuit evaluation, so OLD must only be referenced inside an explicit TG_OP = ''UPDATE'' branch.';

CREATE OR REPLACE FUNCTION internal.protect_placement_forum_lineage()
RETURNS TRIGGER AS $$
DECLARE
    v_old_class_id UUID;
    v_new_class_id UUID;
BEGIN
    IF NEW.topic_id IS NOT DISTINCT FROM OLD.topic_id
       AND NEW.subtopic_id IS NOT DISTINCT FROM OLD.subtopic_id THEN
        RETURN NEW;
    END IF;

    v_old_class_id := internal.placement_class_id(OLD.topic_id, OLD.subtopic_id);
    v_new_class_id := internal.placement_class_id(NEW.topic_id, NEW.subtopic_id);

    IF v_old_class_id IS DISTINCT FROM v_new_class_id
       AND EXISTS (
           SELECT 1 FROM public.forum_posts
           WHERE video_id = NEW.video_id AND class_id = v_old_class_id
       ) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: Cannot move this placement to a different class while forum_posts in the original class reference the video. Move or delete the dependent video_qa posts first.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION internal.protect_placement_forum_lineage() IS 'Library-model successor to protect_video_class_lineage. Fires when a placement is moved (its topic_id or subtopic_id parent changes) to a node in a different class: blocks the move while forum_posts in the original class still reference the video, preserving the forum_post -> video class invariant enforced by validate_forum_post_video_class. Class is resolved from whichever parent is set via internal.placement_class_id. Placement deletes (unplace) are handled by the application; cascade deletes from topic/subtopic/class removal garbage-collect the dependent posts via the videos FK.';

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
           JOIN public.video_placements vp ON vp.video_id = fp.video_id
           WHERE vp.subtopic_id = NEW.id
       ) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: Cannot reparent subtopic % to a topic in a different class while forum_posts reference videos placed within it. Move or delete the dependent video_qa posts first.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION internal.protect_subtopic_class_lineage() IS 'Mirrors protect_placement_forum_lineage one level up: blocks subtopic reparenting that would alter the class lineage of any video (resolved via video_placements) bound to a forum_post.';

CREATE OR REPLACE FUNCTION internal.protect_topic_class_lineage()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.forum_posts fp
        JOIN public.video_placements vp ON vp.video_id = fp.video_id
        WHERE vp.topic_id = NEW.id
           OR vp.subtopic_id IN (SELECT id FROM public.subtopics WHERE topic_id = NEW.id)
    ) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: Cannot move topic % to a different class while forum_posts reference videos placed within it. Move or delete the dependent video_qa posts first.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION internal.protect_topic_class_lineage() IS 'Top of the class-lineage protection chain: blocks topic reassignment that would alter the class of any video bound to a forum_post — whether the video is placed directly on the topic (vp.topic_id) or on one of its subtopics (vp.subtopic_id), under the polymorphic placement model.';

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

CREATE OR REPLACE FUNCTION internal.placement_class_id(p_topic_id UUID, p_subtopic_id UUID)
RETURNS UUID AS $$
DECLARE
    v_class_id UUID;
BEGIN
    IF p_topic_id IS NOT NULL THEN
        SELECT class_id INTO v_class_id FROM public.topics WHERE id = p_topic_id;
    ELSIF p_subtopic_id IS NOT NULL THEN
        SELECT t.class_id INTO v_class_id
        FROM public.subtopics s JOIN public.topics t ON t.id = s.topic_id
        WHERE s.id = p_subtopic_id;
    END IF;
    RETURN v_class_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.placement_class_id(UUID, UUID) IS 'Single source of truth for "which class does this placement belong to" under the polymorphic (topic XOR subtopic) placement model shared by video_placements and resource_placements. Returns the class id from whichever parent column is set (NULL if neither, which the XOR CHECK forbids). SECURITY DEFINER (empty search_path, fully-qualified) so RLS policies and lineage/validation triggers can resolve a placement to its class without reading topics/subtopics under RLS.';

CREATE OR REPLACE FUNCTION internal.owns_video(p_video_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.videos
        WHERE id = p_video_id AND owner_id = (SELECT auth.uid())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.owns_video(UUID) IS 'Bypasses RLS to check whether the caller owns a library video. Used inside the video_placements policies to break the videos <-> video_placements RLS recursion: a direct EXISTS on videos there would re-trigger videos_select, which reads video_placements, which re-triggers this policy, looping (Postgres 42P17). SECURITY DEFINER with empty search_path and fully-qualified references neutralises object-shadowing.';

CREATE OR REPLACE FUNCTION internal.video_in_user_classes(p_video_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.video_placements vp
        WHERE vp.video_id = p_video_id
          AND internal.placement_class_id(vp.topic_id, vp.subtopic_id) IN (SELECT internal.get_user_class_ids())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.video_in_user_classes(UUID) IS 'Bypasses RLS to check whether a library video is placed in any class the caller is enrolled in or teaches (topic- or subtopic-level, resolved via internal.placement_class_id). Used by videos_select_authorized so the videos policy never reads video_placements under RLS — the other half of the fix that prevents the videos <-> video_placements policy recursion (Postgres 42P17). SECURITY DEFINER with empty search_path and fully-qualified references neutralises object-shadowing.';

CREATE OR REPLACE FUNCTION internal.owns_resource(p_resource_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.resources
        WHERE id = p_resource_id AND owner_id = (SELECT auth.uid())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.owns_resource(UUID) IS 'Bypasses RLS to check whether the caller owns a library note (resource). Used inside the resource_placements policies to break the resources <-> resource_placements RLS recursion (Postgres 42P17), mirroring internal.owns_video. SECURITY DEFINER with empty search_path and fully-qualified references neutralises object-shadowing.';

CREATE OR REPLACE FUNCTION internal.resource_in_user_classes(p_resource_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.resource_placements rp
        WHERE rp.resource_id = p_resource_id
          AND internal.placement_class_id(rp.topic_id, rp.subtopic_id) IN (SELECT internal.get_user_class_ids())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.resource_in_user_classes(UUID) IS 'Bypasses RLS to check whether a library note is placed in any class the caller is enrolled in or teaches (topic- or subtopic-level, resolved via internal.placement_class_id). Used by resources_select_authorized so the resources policy never reads resource_placements under RLS — mirrors internal.video_in_user_classes and prevents the resources <-> resource_placements recursion (Postgres 42P17).';

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

/* ==========  EDUCATOR PUBLIC PROFILE  ==========
   Trigger functions, the tier helper, and the public / admin RPCs backing the educator public
   profile feature. The two trigger functions are PLAIN (no SECURITY DEFINER, no search_path pin),
   mirroring maintain_class_published_at and protect_profile_role. */

CREATE OR REPLACE FUNCTION internal.maintain_educator_profile_published_at()
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
COMMENT ON FUNCTION internal.maintain_educator_profile_published_at() IS 'Drives educator_profiles.published_at deterministically from is_published transitions: stamps NOW() on publish, clears on unpublish, ignores any caller-supplied value when unchanged. Structural copy of maintain_class_published_at; plain trigger function (no SECURITY DEFINER, no search_path pin) by design.';

CREATE OR REPLACE FUNCTION internal.protect_educator_admin_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF internal.is_admin() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        /* The educator self-insert policy (educator_profiles_insert_self) does NOT restrict columns,
           so a direct client INSERT could otherwise self-grant verification / a premium tier / a
           vanity slug. Coerce every admin-controlled column to its safe default on a non-admin
           insert — the BEFORE UPDATE branch below never sees INSERTs. */
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

CREATE OR REPLACE FUNCTION internal.get_educator_tier(p_educator_id UUID)
RETURNS public.educator_tier AS $$
DECLARE
    v_tier public.educator_tier;
BEGIN
    SELECT tier INTO v_tier FROM public.educator_profiles WHERE educator_id = p_educator_id;
    RETURN COALESCE(v_tier, 'basic'::public.educator_tier);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION internal.get_educator_tier(UUID) IS 'Single source of truth for an educator''s commercial tier, defaulting to basic when no row exists. SECURITY DEFINER (empty search_path, fully-qualified) so an RLS policy or RPC can read it without a profiles round-trip.';

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

CREATE OR REPLACE FUNCTION public.get_public_educator_profile(p_educator_id UUID)
RETURNS TABLE (
    educator_id UUID,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    role_label TEXT,
    headline TEXT,
    hourly_rate_cents INTEGER,
    subject_tags TEXT[],
    profile_doc JSONB,
    is_verified BOOLEAN,
    tier public.educator_tier,
    published_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ep.educator_id, p.first_name, p.last_name, p.display_name,
        ep.avatar_url, ep.role_label, ep.headline, ep.hourly_rate_cents,
        ep.subject_tags, ep.profile_doc, ep.is_verified, ep.tier, ep.published_at
    FROM public.educator_profiles ep
    JOIN public.profiles p ON p.id = ep.educator_id
    WHERE ep.educator_id = p_educator_id
      AND ep.is_published = TRUE
      AND (
        (p.role = 'educator'::public.user_role AND p.is_approved = TRUE)
        OR p.role = 'admin'::public.user_role
      );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.get_public_educator_profile(UUID) IS 'Public read boundary for an educator''s profile: returns ONLY public-safe columns (no whatsapp / gender / application / audit fields) and ONLY for published profiles owned by an approved educator OR an admin (admins are tutors-with-extra-perms, so they are treated as educators for the public profile boundary; the admin role itself is never returned). The WHERE clause plus the column list ARE the access boundary. Does not widen profiles_public.';

REVOKE EXECUTE ON FUNCTION public.get_public_educator_profile(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_educator_profile(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.published_educator_ids(p_ids UUID[])
RETURNS UUID[] AS $$
BEGIN
    RETURN (
        SELECT COALESCE(array_agg(ep.educator_id), '{}')
        FROM public.educator_profiles ep
        JOIN public.profiles p ON p.id = ep.educator_id
        WHERE ep.educator_id = ANY(p_ids)
          AND ep.is_published = TRUE
          AND (
            (p.role = 'educator'::public.user_role AND p.is_approved = TRUE)
            OR p.role = 'admin'::public.user_role
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.published_educator_ids(UUID[]) IS 'Given a set of educator ids, returns the subset that have a PUBLIC profile (published + approved educator). Lets the marketplace / feeds gate links to /educators/[id] so they never dead-end on an unpublished profile. Returns only ids that are already publicly viewable via get_public_educator_profile, so it leaks nothing beyond that boundary.';

REVOKE EXECUTE ON FUNCTION public.published_educator_ids(UUID[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.published_educator_ids(UUID[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_published_educators(p_limit INTEGER DEFAULT 24, p_subject TEXT DEFAULT NULL)
RETURNS TABLE (
    educator_id UUID,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    role_label TEXT,
    headline TEXT,
    hourly_rate_cents INTEGER,
    subject_tags TEXT[],
    is_verified BOOLEAN,
    tier public.educator_tier,
    published_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ep.educator_id, p.first_name, p.last_name, p.display_name,
        ep.avatar_url, ep.role_label, ep.headline, ep.hourly_rate_cents,
        ep.subject_tags, ep.is_verified, ep.tier, ep.published_at
    FROM public.educator_profiles ep
    JOIN public.profiles p ON p.id = ep.educator_id
    WHERE ep.is_published = TRUE
      AND (
        (p.role = 'educator'::public.user_role AND p.is_approved = TRUE)
        OR p.role = 'admin'::public.user_role
      )
      AND (p_subject IS NULL OR ep.subject_tags @> ARRAY[p_subject])
    ORDER BY (ep.tier = 'premium'::public.educator_tier) DESC, ep.is_verified DESC, ep.published_at DESC NULLS LAST
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 24), 60));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.list_published_educators(INTEGER, TEXT) IS 'Lists PUBLIC educator profiles (published + approved educators, plus admins) for the marketplace surfaces (homepage featured rack + /educators directory). Same access boundary as get_public_educator_profile / published_educator_ids, exposed in bulk. Optional p_subject filters by an exact subject_tag (array containment); p_limit is clamped 1..60. Premium-first, then verified, then most-recently-published (premium educators get marketplace prominence). SECURITY DEFINER (empty search_path, fully-qualified) so anon can read it without per-row RLS on educator_profiles.';

REVOKE EXECUTE ON FUNCTION public.list_published_educators(INTEGER, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_published_educators(INTEGER, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_educator_verified(p_educator_id UUID, p_verified BOOLEAN)
RETURNS VOID AS $$
BEGIN
    IF NOT internal.is_admin() THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Only admins can verify educators.';
    END IF;

    UPDATE public.educator_profiles
    SET is_verified = p_verified,
        verified_by = CASE WHEN p_verified THEN (SELECT auth.uid()) ELSE NULL END,
        verified_at = CASE WHEN p_verified THEN NOW() ELSE NULL END
    WHERE educator_id = p_educator_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Educator profile % not found.', p_educator_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.set_educator_verified(UUID, BOOLEAN) IS 'Admin-only: flips is_verified and stamps / clears the verified_by and verified_at audit columns. SECURITY DEFINER bypasses protect_educator_admin_fields; the function enforces the admin check itself. Mirrors approve_educator.';

REVOKE EXECUTE ON FUNCTION public.set_educator_verified(UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_educator_verified(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_educator_tier(p_educator_id UUID, p_tier public.educator_tier)
RETURNS VOID AS $$
BEGIN
    IF NOT internal.is_admin() THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Only admins can set educator tiers.';
    END IF;

    UPDATE public.educator_profiles SET tier = p_tier WHERE educator_id = p_educator_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Educator profile % not found.', p_educator_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
COMMENT ON FUNCTION public.set_educator_tier(UUID, public.educator_tier) IS 'Admin-only: sets an educator''s commercial tier. SECURITY DEFINER bypasses protect_educator_admin_fields; the function enforces the admin check itself. Mirrors approve_educator.';

REVOKE EXECUTE ON FUNCTION public.set_educator_tier(UUID, public.educator_tier) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_educator_tier(UUID, public.educator_tier) TO authenticated;

/* ==========  EDUCATOR REVIEWS  ==========
   Public read boundary + admin moderation for the educator_reviews table. Mirrors the educator
   public-profile RPCs: SECURITY DEFINER, empty search_path, fully-qualified, the WHERE clause and
   column list ARE the access boundary. */

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
BEGIN
    RETURN QUERY
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
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';
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
