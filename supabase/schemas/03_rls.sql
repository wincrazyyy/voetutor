/* ==========  03_rls.sql  ==========
   ENABLE / FORCE RLS for every table, then every policy. Policies
   reference internal.* helpers from 01_functions.sql; tables come
   from 02_schema.sql. New tables MUST appear in both ALTER TABLE
   blocks below and have at least a SELECT policy before going live. */

/* ==========  RLS ACTIVATION  ========== */

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_video_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_post_upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE educator_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE class_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE topics FORCE ROW LEVEL SECURITY;
ALTER TABLE subtopics FORCE ROW LEVEL SECURITY;
ALTER TABLE videos FORCE ROW LEVEL SECURITY;
ALTER TABLE video_placements FORCE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;
ALTER TABLE user_video_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE forum_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE forum_replies FORCE ROW LEVEL SECURITY;
ALTER TABLE forum_post_upvotes FORCE ROW LEVEL SECURITY;
ALTER TABLE educator_profiles FORCE ROW LEVEL SECURITY;

/* ==========  ROW LEVEL SECURITY POLICIES  ========== */
/* Conventions enforced across every policy below:
     - TO authenticated      — policies never apply to anon, short-circuiting at the role check.
     - (SELECT auth.uid())   — wrapped so the planner hoists the call to an InitPlan that runs once per query.
     - (SELECT internal.X()) — same treatment for SECURITY DEFINER helpers (is_admin, is_active_educator, is_class_educator).
     - is_admin() preferred over get_user_role() = 'admin' — same intent, no surprises if FORCE RLS interactions change. */

/* ----- PROFILES ----- */
CREATE POLICY profiles_select_self_or_admin ON profiles
    FOR SELECT TO authenticated
    USING ((SELECT internal.is_admin()) OR (SELECT auth.uid()) = id);
COMMENT ON POLICY profiles_select_self_or_admin ON profiles IS 'Direct reads of the profiles row are deliberately restricted to the owning user or an administrator. Cross-user rendering needs (forum author names, Q&A educator badges) MUST go through the public.profiles_public view, which exposes only the columns the UI is sanctioned to display. This split makes the public surface area explicit instead of accidental.';

CREATE POLICY profiles_update_self_or_admin ON profiles
    FOR UPDATE TO authenticated
    USING ((SELECT internal.is_admin()) OR (SELECT auth.uid()) = id)
    WITH CHECK ((SELECT internal.is_admin()) OR (SELECT auth.uid()) = id);
COMMENT ON POLICY profiles_update_self_or_admin ON profiles IS 'Restricts profile modifications to the owning user or administrators. WITH CHECK matches USING so a self-update cannot be redirected onto another user''s row mid-flight; the anti-tampering trigger additionally locks the id column. Re-SELECT validation on the post-update row passes against profiles_select_self_or_admin because the updater is by definition either the row owner or an admin.';

/* ----- CLASSES ----- */
CREATE POLICY classes_select_authorized ON classes
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR educator_id = (SELECT auth.uid())
        OR is_published = TRUE
        OR id IN (SELECT class_id FROM public.class_enrollments WHERE user_id = (SELECT auth.uid()))
    );
COMMENT ON POLICY classes_select_authorized ON classes IS 'Visible to admins, the assigned educator (direct column compare avoids the post-INSERT visibility issue where the just-written row may not yet appear in helper-function subqueries), enrolled students, and any authenticated user when the class is published. Unpublished, un-owned, un-enrolled classes remain invisible.';

CREATE POLICY classes_update_educator_or_admin ON classes
    FOR UPDATE TO authenticated
    USING ((SELECT internal.is_admin()) OR educator_id = (SELECT auth.uid()))
    WITH CHECK ((SELECT internal.is_admin()) OR educator_id = (SELECT auth.uid()));
COMMENT ON POLICY classes_update_educator_or_admin ON classes IS 'Educators modify their own classes; admins modify any. Explicit WITH CHECK matches USING so the post-update row must still be owned by the caller — educators cannot transfer ownership mid-update.';

CREATE POLICY classes_insert_educator_or_admin ON classes
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT internal.is_admin())
        OR (educator_id = (SELECT auth.uid()) AND (SELECT internal.is_active_educator()))
    );
COMMENT ON POLICY classes_insert_educator_or_admin ON classes IS 'Admins create on anyone''s behalf; approved educators self-create classes they own. is_admin / is_active_educator are SECURITY DEFINER (search_path empty, fully-qualified references) so the policy never depends on RLS-on-profiles round-trips.';

CREATE POLICY classes_delete_educator_or_admin ON classes
    FOR DELETE TO authenticated
    USING ((SELECT internal.is_admin()) OR educator_id = (SELECT auth.uid()));
COMMENT ON POLICY classes_delete_educator_or_admin ON classes IS 'Educator who owns the class or any admin may delete it. Cascades remove dependent topics/subtopics/videos/forum data.';

/* ----- CLASS ENROLLMENTS ----- */
CREATE POLICY enrollments_select_authorized ON class_enrollments
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR user_id = (SELECT auth.uid())
        OR (SELECT internal.is_class_educator(class_id))
    );
COMMENT ON POLICY enrollments_select_authorized ON class_enrollments IS 'Allows users to view their own enrollments, whilst granting educators visibility over their class rosters.';

CREATE POLICY enrollments_insert_educator_or_admin ON class_enrollments
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT internal.is_admin())
        OR (SELECT internal.is_class_educator(class_id))
    );
COMMENT ON POLICY enrollments_insert_educator_or_admin ON class_enrollments IS 'Restricts the addition of students to a roster exclusively to the assigned educator and administrators. Self-enrolment for free classes flows through the enroll_in_free_class SECURITY DEFINER RPC, which bypasses this policy.';

CREATE POLICY enrollments_delete_authorized ON class_enrollments
    FOR DELETE TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR user_id = (SELECT auth.uid())
        OR (SELECT internal.is_class_educator(class_id))
    );
COMMENT ON POLICY enrollments_delete_authorized ON class_enrollments IS 'Permits self-unenrollment by students, and roster management by educators/administrators.';

/* ----- CLASS REPORTS ----- */
CREATE POLICY class_reports_select_own_or_admin ON class_reports
    FOR SELECT TO authenticated
    USING ((SELECT internal.is_admin()) OR reporter_id = (SELECT auth.uid()));
COMMENT ON POLICY class_reports_select_own_or_admin ON class_reports IS 'Admins triage every report; reporters can see what they themselves submitted (and how it was resolved). Educators do not see reports against their own classes — moderation is opaque to the reported party by design.';

CREATE POLICY class_reports_insert_authenticated_reporter ON class_reports
    FOR INSERT TO authenticated
    WITH CHECK (
        reporter_id = (SELECT auth.uid())
        AND status = 'pending'::class_report_status
        AND resolved_by IS NULL
        AND resolved_at IS NULL
    );
COMMENT ON POLICY class_reports_insert_authenticated_reporter ON class_reports IS 'Any authenticated user may submit a report against any class. The unique partial index uniq_class_reports_pending_per_user blocks repeat pending reports from the same reporter on the same class. Resolution columns are forced to their initial state — only admins move the report through its lifecycle.';

CREATE POLICY class_reports_update_admin ON class_reports
    FOR UPDATE TO authenticated
    USING ((SELECT internal.is_admin()))
    WITH CHECK ((SELECT internal.is_admin()));
COMMENT ON POLICY class_reports_update_admin ON class_reports IS 'Only admins may transition a report between pending → dismissed | actioned and stamp the audit columns.';

CREATE POLICY class_reports_delete_admin ON class_reports
    FOR DELETE TO authenticated
    USING ((SELECT internal.is_admin()));
COMMENT ON POLICY class_reports_delete_admin ON class_reports IS 'Hard delete reserved for admins (typically for spam scrubbing); ordinary lifecycle is status transitions, not deletes.';

/* ----- CURRICULUM HIERARCHY ----- */

/* TOPICS */
CREATE POLICY topics_select_authorized ON topics
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR class_id IN (SELECT internal.get_user_class_ids())
    );
COMMENT ON POLICY topics_select_authorized ON topics IS 'Inherits visibility boundaries from the parent class enrollment status.';

CREATE POLICY topics_modify_educator_or_admin ON topics
    FOR ALL TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (SELECT 1 FROM public.classes WHERE id = topics.class_id AND educator_id = (SELECT auth.uid()))
    );
COMMENT ON POLICY topics_modify_educator_or_admin ON topics IS 'Delegates structural modification rights (Insert/Update/Delete) for topics to the parent class educator and administrators.';

/* SUBTOPICS */
CREATE POLICY subtopics_select_authorized ON subtopics
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.topics t
            WHERE t.id = subtopics.topic_id AND t.class_id IN (SELECT internal.get_user_class_ids())
        )
    );
COMMENT ON POLICY subtopics_select_authorized ON subtopics IS 'Inherits visibility boundaries from the parent topic hierarchy via an EXISTS join.';

CREATE POLICY subtopics_modify_educator_or_admin ON subtopics
    FOR ALL TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.topics t
            JOIN public.classes c ON c.id = t.class_id
            WHERE t.id = subtopics.topic_id AND c.educator_id = (SELECT auth.uid())
        )
    );
COMMENT ON POLICY subtopics_modify_educator_or_admin ON subtopics IS 'Delegates structural modification rights (Insert/Update/Delete) for subtopics to the parent class educator via hierarchical resolution.';

/* VIDEOS */
CREATE POLICY videos_select_authorized ON videos
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR owner_id = (SELECT auth.uid())
        OR (SELECT internal.video_in_user_classes(videos.id))
    );
COMMENT ON POLICY videos_select_authorized ON videos IS 'Library videos are visible to admins, the owning educator, and any user enrolled in (or teaching) a class the video is placed into. The placement check goes through internal.video_in_user_classes (SECURITY DEFINER) rather than an inline subquery so the videos policy never reads video_placements under RLS — otherwise videos_select and video_placements_modify would recurse (Postgres 42P17).';

CREATE POLICY videos_modify_educator_or_admin ON videos
    FOR ALL TO authenticated
    USING ((SELECT internal.is_admin()) OR owner_id = (SELECT auth.uid()));
COMMENT ON POLICY videos_modify_educator_or_admin ON videos IS 'Library videos are managed (Insert/Update/Delete) by their owning educator or an admin. Ownership resolves directly from owner_id. FOR ALL with USING only (matching the curriculum-modify convention): Postgres applies USING to both the existing and the new row, so an INSERT must set owner_id to the caller and an UPDATE cannot reassign ownership.';

/* VIDEO PLACEMENTS */
CREATE POLICY video_placements_select_authorized ON video_placements
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.subtopics s
            JOIN public.topics t ON t.id = s.topic_id
            WHERE s.id = video_placements.subtopic_id AND t.class_id IN (SELECT internal.get_user_class_ids())
        )
    );
COMMENT ON POLICY video_placements_select_authorized ON video_placements IS 'A placement is visible to anyone who can see its subtopic — i.e. users enrolled in or teaching the placement''s class. Drives curriculum rendering for students and educators.';

CREATE POLICY video_placements_modify_educator_or_admin ON video_placements
    FOR ALL TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR (
            EXISTS (
                SELECT 1 FROM public.subtopics s
                JOIN public.topics t ON t.id = s.topic_id
                JOIN public.classes c ON c.id = t.class_id
                WHERE s.id = video_placements.subtopic_id AND c.educator_id = (SELECT auth.uid())
            )
            AND (SELECT internal.owns_video(video_placements.video_id))
        )
    );
COMMENT ON POLICY video_placements_modify_educator_or_admin ON video_placements IS 'Placing/reordering/removing a video requires the caller to BOTH own the destination class (educator) AND own the video — enforcing the same-educator-only sharing rule. FOR ALL with no separate WITH CHECK means USING is applied to both the old and new row, so a cross-class move must satisfy ownership on both endpoints. The video-ownership half goes through internal.owns_video (SECURITY DEFINER) so this policy never reads videos under RLS — otherwise it would recurse with videos_select (Postgres 42P17).';

/* RESOURCES */
CREATE POLICY resources_select_authorized ON resources
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (SELECT 1 FROM public.topics t WHERE t.id = resources.topic_id AND t.class_id IN (SELECT internal.get_user_class_ids()))
        OR EXISTS (
            SELECT 1 FROM public.subtopics s
            JOIN public.topics t ON t.id = s.topic_id
            WHERE s.id = resources.subtopic_id AND t.class_id IN (SELECT internal.get_user_class_ids())
        )
    );
COMMENT ON POLICY resources_select_authorized ON resources IS 'Resolves visibility boundaries dynamically depending on whether the resource is bound to a topic or a subtopic.';

CREATE POLICY resources_modify_educator_or_admin ON resources
    FOR ALL TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.topics t
            JOIN public.classes c ON c.id = t.class_id
            WHERE t.id = resources.topic_id AND c.educator_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.subtopics s
            JOIN public.topics t ON t.id = s.topic_id
            JOIN public.classes c ON c.id = t.class_id
            WHERE s.id = resources.subtopic_id AND c.educator_id = (SELECT auth.uid())
        )
    );
COMMENT ON POLICY resources_modify_educator_or_admin ON resources IS 'Delegates file asset management to the parent class educator, dynamically evaluating the polymorphic parent linkage.';

/* ----- USER VIDEO PROGRESS ----- */
CREATE POLICY progress_select_authorized ON user_video_progress
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.video_placements vp
            JOIN public.subtopics s ON s.id = vp.subtopic_id
            JOIN public.topics t ON t.id = s.topic_id
            JOIN public.classes c ON c.id = t.class_id
            WHERE vp.video_id = user_video_progress.video_id AND c.educator_id = (SELECT auth.uid())
        )
    );
COMMENT ON POLICY progress_select_authorized ON user_video_progress IS 'Permits students to fetch their own telemetry state, while granting educators visibility over progress for any video placed in a class they own (resolved via video_placements).';

CREATE POLICY progress_insert_self ON user_video_progress
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));
COMMENT ON POLICY progress_insert_self ON user_video_progress IS 'Restricts generation of playback telemetry strictly to the authenticated user generating the state.';

CREATE POLICY progress_update_self ON user_video_progress
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));
COMMENT ON POLICY progress_update_self ON user_video_progress IS 'Restricts updating of playback telemetry strictly to the authenticated user generating the state.';

/* ----- ANNOUNCEMENTS ----- */
CREATE POLICY announcements_select_authorized ON announcements
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR class_id IN (SELECT internal.get_user_class_ids())
    );
COMMENT ON POLICY announcements_select_authorized ON announcements IS 'Inherits visibility boundaries from the parent class enrollment status.';

CREATE POLICY announcements_insert_author ON announcements
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT internal.is_admin())
        OR (
            author_id = (SELECT auth.uid())
            AND EXISTS (SELECT 1 FROM public.classes WHERE id = announcements.class_id AND educator_id = (SELECT auth.uid()))
        )
    );
COMMENT ON POLICY announcements_insert_author ON announcements IS 'Secures unidirectional broadcast capability exclusively to the assigned class educator and administrators.';

CREATE POLICY announcements_update_author ON announcements
    FOR UPDATE TO authenticated
    USING ((SELECT internal.is_admin()) OR author_id = (SELECT auth.uid()));
COMMENT ON POLICY announcements_update_author ON announcements IS 'Grants broadcast modification rights strictly to the original authoring educator or global administrators. Scoped to UPDATE only — INSERT remains exclusively governed by announcements_insert_author so enrolled students cannot self-author announcements via permissive policy ORing.';

CREATE POLICY announcements_delete_author ON announcements
    FOR DELETE TO authenticated
    USING ((SELECT internal.is_admin()) OR author_id = (SELECT auth.uid()));
COMMENT ON POLICY announcements_delete_author ON announcements IS 'Grants broadcast deletion rights strictly to the original authoring educator or global administrators.';

/* ----- FORUM POSTS ----- */
CREATE POLICY forum_posts_select_authorized ON forum_posts
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR class_id IN (SELECT internal.get_user_class_ids())
    );
COMMENT ON POLICY forum_posts_select_authorized ON forum_posts IS 'Confines discussion visibility strictly to users enrolled in or teaching the related class.';

CREATE POLICY forum_posts_insert_authorized ON forum_posts
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = (SELECT auth.uid())
        AND (
            (SELECT internal.is_admin())
            OR class_id IN (SELECT internal.get_user_class_ids())
        )
    );
COMMENT ON POLICY forum_posts_insert_authorized ON forum_posts IS 'Permits thread creation by explicitly enforcing the author identity and validating active class enrollment.';

CREATE POLICY forum_posts_update_authorized ON forum_posts
    FOR UPDATE TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR author_id = (SELECT auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes WHERE id = forum_posts.class_id AND educator_id = (SELECT auth.uid()))
    );
COMMENT ON POLICY forum_posts_update_authorized ON forum_posts IS 'Grants editing rights to authors and educators. Anti-tampering triggers prevent authors from hijacking posts or moving classes.';

CREATE POLICY forum_posts_delete_authorized ON forum_posts
    FOR DELETE TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR author_id = (SELECT auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes WHERE id = forum_posts.class_id AND educator_id = (SELECT auth.uid()))
    );
COMMENT ON POLICY forum_posts_delete_authorized ON forum_posts IS 'Permits content deletion by the original author, acting educators (for moderation), or global administrators.';

/* ----- FORUM REPLIES ----- */
CREATE POLICY forum_replies_select_authorized ON forum_replies
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.forum_posts fp
            WHERE fp.id = forum_replies.post_id AND fp.class_id IN (SELECT internal.get_user_class_ids())
        )
    );
COMMENT ON POLICY forum_replies_select_authorized ON forum_replies IS 'Resolves reply visibility dynamically by validating access to the parent post context.';

CREATE POLICY forum_replies_insert_authorized ON forum_replies
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = (SELECT auth.uid())
        AND (
            (SELECT internal.is_admin())
            OR EXISTS (
                SELECT 1 FROM public.forum_posts fp
                WHERE fp.id = forum_replies.post_id AND fp.class_id IN (SELECT internal.get_user_class_ids())
            )
        )
    );
COMMENT ON POLICY forum_replies_insert_authorized ON forum_replies IS 'Permits reply creation by enforcing author identity and validating access to the parent post context.';

CREATE POLICY forum_replies_update_author ON forum_replies
    FOR UPDATE TO authenticated
    USING ((SELECT internal.is_admin()) OR author_id = (SELECT auth.uid()));
COMMENT ON POLICY forum_replies_update_author ON forum_replies IS 'Strictly isolates reply editing capabilities to the original author, preventing educators from modifying student discourse.';

CREATE POLICY forum_replies_delete_authorized ON forum_replies
    FOR DELETE TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR author_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.forum_posts fp
            JOIN public.classes c ON c.id = fp.class_id
            WHERE fp.id = forum_replies.post_id AND c.educator_id = (SELECT auth.uid())
        )
    );
COMMENT ON POLICY forum_replies_delete_authorized ON forum_replies IS 'Permits reply deletion by the original author, acting educators (for moderation), or global administrators.';

/* ----- FORUM POST UPVOTES ----- */
CREATE POLICY forum_post_upvotes_select_authorized ON forum_post_upvotes
    FOR SELECT TO authenticated
    USING (
        (SELECT internal.is_admin())
        OR EXISTS (
            SELECT 1 FROM public.forum_posts fp
            WHERE fp.id = forum_post_upvotes.post_id AND fp.class_id IN (SELECT internal.get_user_class_ids())
        )
    );
COMMENT ON POLICY forum_post_upvotes_select_authorized ON forum_post_upvotes IS 'Mirrors forum post visibility — endorsements are visible only to users authorised to access the parent post context.';

CREATE POLICY forum_post_upvotes_insert_self ON forum_post_upvotes
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.forum_posts fp
            WHERE fp.id = forum_post_upvotes.post_id AND fp.class_id IN (SELECT internal.get_user_class_ids())
        )
    );
COMMENT ON POLICY forum_post_upvotes_insert_self ON forum_post_upvotes IS 'Permits a user to register a single endorsement against a post within their authorisation perimeter. The composite primary key structurally prevents duplicate votes.';

CREATE POLICY forum_post_upvotes_delete_self ON forum_post_upvotes
    FOR DELETE TO authenticated
    USING ((SELECT internal.is_admin()) OR user_id = (SELECT auth.uid()));
COMMENT ON POLICY forum_post_upvotes_delete_self ON forum_post_upvotes IS 'Permits self-rescission of an endorsement, alongside administrative override for moderation.';

/* ----- EDUCATOR PROFILES ----- */
CREATE POLICY educator_profiles_select_self_or_admin ON educator_profiles
    FOR SELECT TO authenticated
    USING ((SELECT internal.is_admin()) OR (SELECT auth.uid()) = educator_id);
COMMENT ON POLICY educator_profiles_select_self_or_admin ON educator_profiles IS 'The educator owns their row; admins can read every row to support approval review. Public promotion surfaces (future feature) will read through a SECURITY DEFINER function or a dedicated view rather than this policy.';

CREATE POLICY educator_profiles_insert_self ON educator_profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = educator_id
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'educator'::user_role
        )
    );
COMMENT ON POLICY educator_profiles_insert_self ON educator_profiles IS 'Only the owning educator can create their row, and only if their literal profile role is educator (covers both pending and approved educators; students cannot insert).';

CREATE POLICY educator_profiles_update_self ON educator_profiles
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = educator_id)
    WITH CHECK ((SELECT auth.uid()) = educator_id);
COMMENT ON POLICY educator_profiles_update_self ON educator_profiles IS 'Educators may keep updating their own application info indefinitely. WITH CHECK matches USING so the row cannot be redirected onto another educator mid-update.';

CREATE POLICY educator_profiles_delete_self_or_admin ON educator_profiles
    FOR DELETE TO authenticated
    USING ((SELECT internal.is_admin()) OR (SELECT auth.uid()) = educator_id);
COMMENT ON POLICY educator_profiles_delete_self_or_admin ON educator_profiles IS 'Educator can wipe their extended info; admin can clean it up if needed.';
