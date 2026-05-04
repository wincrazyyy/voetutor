/* ==========  ENUMERATED TYPES  ========== */

CREATE TYPE user_role AS ENUM ('student', 'educator', 'admin');
CREATE TYPE announcement_type AS ENUM ('standard', 'important', 'event');
CREATE TYPE topic_status AS ENUM ('locked', 'active', 'completed');
CREATE TYPE forum_post_type AS ENUM ('general', 'video_qa');

/* ==========  SHARED TRIGGER FUNCTIONS  ========== */

CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION public.set_current_timestamp_updated_at() IS 'Generic trigger function to enforce accurate audit trails for record modifications.';

CREATE OR REPLACE FUNCTION public.set_forum_post_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION public.set_forum_post_updated_at() IS 'Variant of set_current_timestamp_updated_at scoped to forum_posts. Skips the timestamp bump when the update originates inside a nested trigger chain (i.e., the upvote-ledger maintenance trigger), so endorsements do not pollute the post modification timestamp. User-issued edits still arrive at depth 1 and bump updated_at as expected.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
COMMENT ON FUNCTION public.handle_new_user() IS 'Automates profile provisioning upon identity creation. Reads intended_role from user-controlled metadata but constrains the resulting state: educator implies is_approved = FALSE (gated until an admin promotes them); anything else lands on a fully-approved student. The admin role is never assignable from this path, neutralising privilege escalation via signup metadata.';

/* ==========  PROFILES & RBAC  ========== */

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    display_name VARCHAR(100),
    role user_role DEFAULT 'student'::user_role NOT NULL,
    is_approved BOOLEAN DEFAULT TRUE NOT NULL,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE profiles IS 'Extended user profile data maintaining a strict 1:1 relationship with the external authentication provider.';
COMMENT ON COLUMN profiles.role IS 'Literal role declared at signup. Note: this is NOT the effective authorisation level — read public.get_user_role() instead, which folds unapproved educators back to ''student''.';
COMMENT ON COLUMN profiles.is_approved IS 'Approval gate. Defaults to TRUE for students (no review needed) and is forced to FALSE by handle_new_user when intended_role is educator. Only an admin may flip this column (enforced by protect_profile_role).';
COMMENT ON COLUMN profiles.approved_by IS 'The admin who flipped is_approved from FALSE to TRUE, captured for audit trail. Set automatically by approve_educator().';

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

CREATE VIEW public.profiles_public
WITH (security_invoker = off) AS
SELECT id, first_name, last_name, display_name, role, is_approved
FROM public.profiles;
COMMENT ON VIEW public.profiles_public IS 'Sanctioned cross-user projection of the profiles table. Runs with security_invoker = off, so it bypasses RLS on profiles and returns the listed columns regardless of who is asking — but the column list itself is the access boundary, deliberately omitting created_at/updated_at and any future sensitive fields. App code must JOIN against this view (not the underlying table) when rendering another user''s identity in forums, Q&A, etc.';

GRANT SELECT ON public.profiles_public TO authenticated;

CREATE TABLE educator_profiles (
    educator_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    gender VARCHAR(50),
    whatsapp_number VARCHAR(50),
    education TEXT,
    education_degree VARCHAR(255),
    education_major VARCHAR(255),
    graduation_year INTEGER CHECK (graduation_year IS NULL OR (graduation_year >= 1900 AND graduation_year <= 2100)),
    teaching_experience TEXT,
    teaching_subjects TEXT,
    self_introduction TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE educator_profiles IS 'Optional 1:1 sidecar to profiles holding application / promotion fields that only educators care about. Filled in after sign-up by the educator themselves; admins read it during approval review and may also surface it on public educator profiles for promotion.';
COMMENT ON COLUMN educator_profiles.self_introduction IS 'Free-form pitch the educator writes about themselves. Surfaced to admins for review and may be displayed publicly for promotion — front-end UI warns the educator to keep it serious.';

CREATE TRIGGER set_educator_profiles_updated_at
    BEFORE UPDATE ON educator_profiles
    FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

/* ==========  CORE CURRICULUM ARCHITECTURE  ========== */

CREATE TABLE classes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE, 
    title VARCHAR(255) NOT NULL, 
    educator_id UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE classes IS 'Defines top-level instructional containers within the platform hierarchy.';
COMMENT ON COLUMN classes.educator_id IS 'Permits NULL on deletion to preserve historical class data if an educator is removed from the system.';

CREATE INDEX idx_classes_educator_id ON classes(educator_id);

CREATE TRIGGER set_classes_updated_at
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE class_enrollments (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, class_id)
);
COMMENT ON TABLE class_enrollments IS 'Resolves the many-to-many relationship between users and classes. Treated as an immutable join row — mutations happen via DELETE + re-INSERT, hence no updated_at column or UPDATE policy.';
COMMENT ON COLUMN class_enrollments.user_id IS 'Acts as the leading column in the primary key B-tree, implicitly indexing queries filtering strictly by user_id.';

CREATE INDEX idx_class_enrollments_class_id ON class_enrollments(class_id);

/* ----------------------------------------- */

CREATE TABLE topics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title VARCHAR(255) NOT NULL,
    total_duration INTERVAL, 
    status topic_status DEFAULT 'locked'::topic_status NOT NULL,
    order_index INTEGER NOT NULL CHECK (order_index >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE topics IS 'First-order structural children of classes, representing sequential learning modules.';
COMMENT ON COLUMN topics.total_duration IS 'Utilises native INTERVAL type to allow precise date/time arithmetic and aggregation.';

CREATE INDEX idx_topics_class_id ON topics(class_id);

CREATE TRIGGER set_topics_updated_at
    BEFORE UPDATE ON topics
    FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE subtopics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title VARCHAR(255) NOT NULL,
    order_index INTEGER NOT NULL CHECK (order_index >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE subtopics IS 'Second-order structural children providing granular organisational boundaries within topics.';

CREATE INDEX idx_subtopics_topic_id ON subtopics(topic_id);

CREATE TRIGGER set_subtopics_updated_at
    BEFORE UPDATE ON subtopics
    FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE videos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subtopic_id UUID NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration INTERVAL,
    video_url VARCHAR(2048),
    order_index INTEGER NOT NULL CHECK (order_index >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_videos_url_format CHECK (
        video_url IS NULL OR video_url ~* '^https://'
    )
);
COMMENT ON TABLE videos IS 'Primary instructional media nodes tied strictly to subtopics.';
COMMENT ON COLUMN videos.video_url IS 'Constrained to 2048 characters matching the maximum safe limit for standardised web URLs.';
COMMENT ON CONSTRAINT chk_videos_url_format ON videos IS 'Ensures any provided URL is a valid HTTPS format; rejects insecure http:// transport.';

CREATE INDEX idx_videos_subtopic_id ON videos(subtopic_id);

CREATE TRIGGER set_videos_updated_at
    BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE resources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    file_url VARCHAR(2048) NOT NULL,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_resource_parent_exclusivity CHECK (
        (topic_id IS NOT NULL AND subtopic_id IS NULL) OR
        (topic_id IS NULL AND subtopic_id IS NOT NULL)
    ),
    CONSTRAINT chk_resources_url_format CHECK (file_url ~* '^https://')
);
COMMENT ON TABLE resources IS 'Polymorphic asset table supporting attachments to either topics or subtopics via constrained exclusivity.';
COMMENT ON COLUMN resources.size_bytes IS 'Enforces BIGINT to prevent overflow issues common with large file representations in 32-bit integers.';
COMMENT ON CONSTRAINT chk_resource_parent_exclusivity ON resources IS 'Guarantees the structural integrity of the asset hierarchy by acting as an XOR gate.';
COMMENT ON CONSTRAINT chk_resources_url_format ON resources IS 'Enforces valid HTTPS protocol formatting for the mandatory file_url; rejects insecure http:// transport.';

CREATE INDEX idx_resources_topic_id ON resources(topic_id);
CREATE INDEX idx_resources_subtopic_id ON resources(subtopic_id);

CREATE TRIGGER set_resources_updated_at
    BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

/* ==========  USER PROGRESS TRACKING  ========== */

CREATE TABLE user_video_progress (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE ON UPDATE CASCADE,
    last_position INTERVAL DEFAULT '0 seconds'::interval NOT NULL 
        CHECK (last_position >= '0 seconds'::interval),
    total_watch_time INTERVAL DEFAULT '0 seconds'::interval NOT NULL 
        CHECK (total_watch_time >= '0 seconds'::interval),
    is_completed BOOLEAN DEFAULT FALSE NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, video_id)
);
COMMENT ON TABLE user_video_progress IS 'Stateful record of client-side playback telemetry and definitive completion metrics.';
COMMENT ON COLUMN user_video_progress.last_position IS 'Maintains the exact playhead coordinate as an INTERVAL for persistent resume functionality.';
COMMENT ON COLUMN user_video_progress.total_watch_time IS 'Aggregates total engagement duration as an INTERVAL, facilitating advanced retention analytics.';

CREATE INDEX idx_user_video_progress_video_id ON user_video_progress(video_id);

CREATE TRIGGER set_user_video_progress_updated_at
    BEFORE UPDATE ON user_video_progress
    FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

/* ==========  COMMUNICATIONS & FORUM  ========== */

CREATE TABLE announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    type announcement_type DEFAULT 'standard'::announcement_type NOT NULL,
    link_title VARCHAR(255),
    link_url VARCHAR(2048),
    image_alt VARCHAR(255),
    image_url VARCHAR(2048),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_announcements_link_url_format CHECK (
        link_url IS NULL OR link_url ~* '^https://'
    ),
    CONSTRAINT chk_announcements_image_url_format CHECK (
        image_url IS NULL OR image_url ~* '^https://'
    )
);
COMMENT ON TABLE announcements IS 'Unidirectional broadcast payloads distributed from administrators/educators to enrolled users.';
COMMENT ON CONSTRAINT chk_announcements_link_url_format ON announcements IS 'Ensures optional link attachments are valid HTTPS URLs; rejects insecure http:// transport.';
COMMENT ON CONSTRAINT chk_announcements_image_url_format ON announcements IS 'Ensures optional image attachments are valid HTTPS URLs; rejects insecure http:// transport.';

CREATE INDEX idx_announcements_class_id ON announcements(class_id);
CREATE INDEX idx_announcements_author_id ON announcements(author_id);

CREATE TRIGGER set_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE forum_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    type forum_post_type DEFAULT 'general'::forum_post_type NOT NULL,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE ON UPDATE CASCADE, 
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0 NOT NULL CHECK (upvotes >= 0),
    is_resolved BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_forum_post_video_context CHECK (
        (type = 'general' AND video_id IS NULL) OR 
        (type = 'video_qa' AND video_id IS NOT NULL)
    )
);
COMMENT ON TABLE forum_posts IS 'Primary asynchronous discussion nodes establishing the root of a conversation thread.';
COMMENT ON CONSTRAINT chk_forum_post_video_context ON forum_posts IS 'Enforces the presence of a target video reference exclusively when the thread context demands it.';

CREATE INDEX idx_forum_posts_class_id ON forum_posts(class_id);
CREATE INDEX idx_forum_posts_author_id ON forum_posts(author_id);
CREATE INDEX idx_forum_posts_video_id ON forum_posts(video_id);

CREATE TRIGGER set_forum_posts_updated_at
    BEFORE UPDATE ON forum_posts
    FOR EACH ROW EXECUTE PROCEDURE public.set_forum_post_updated_at();

/* ----------------------------------------- */

CREATE TABLE forum_replies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE ON UPDATE CASCADE,
    parent_reply_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE ON UPDATE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE forum_replies IS 'Conversational appendages supporting infinite nesting via an adjacency list architecture.';
COMMENT ON COLUMN forum_replies.post_id IS 'Binds the reply to the root discussion thread. Retained on all nested replies to prevent expensive recursive lookups when fetching a flat thread count.';
COMMENT ON COLUMN forum_replies.parent_reply_id IS 'Self-referencing constraint enabling hierarchical, threaded comment trees. A NULL value indicates a top-level reply directly to the main post.';

CREATE INDEX idx_forum_replies_post_id ON forum_replies(post_id);
CREATE INDEX idx_forum_replies_parent_reply_id ON forum_replies(parent_reply_id);
CREATE INDEX idx_forum_replies_author_id ON forum_replies(author_id);

CREATE TRIGGER set_forum_replies_updated_at
    BEFORE UPDATE ON forum_replies
    FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE forum_post_upvotes (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    post_id UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, post_id)
);
COMMENT ON TABLE forum_post_upvotes IS 'Authoritative ledger of forum post endorsements. The composite primary key enforces one-vote-per-user, and the table serves as the source of truth feeding the denormalized forum_posts.upvotes counter.';

CREATE INDEX idx_forum_post_upvotes_post_id ON forum_post_upvotes(post_id);

CREATE OR REPLACE FUNCTION public.maintain_forum_post_upvote_count()
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
COMMENT ON FUNCTION public.maintain_forum_post_upvote_count() IS 'Maintains the denormalized forum_posts.upvotes counter in lockstep with the forum_post_upvotes ledger. Runs as SECURITY DEFINER (search_path pinned) so the upvoter (who is typically not the post owner) can mutate the counter despite forum_posts RLS.';

CREATE TRIGGER maintain_upvote_count_on_insert
    AFTER INSERT ON forum_post_upvotes
    FOR EACH ROW EXECUTE PROCEDURE public.maintain_forum_post_upvote_count();

CREATE TRIGGER maintain_upvote_count_on_delete
    AFTER DELETE ON forum_post_upvotes
    FOR EACH ROW EXECUTE PROCEDURE public.maintain_forum_post_upvote_count();

/* ==========  ANTI-TAMPERING TRIGGERS  ========== */

CREATE OR REPLACE FUNCTION public.prevent_immutable_modifications()
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
COMMENT ON FUNCTION public.prevent_immutable_modifications() IS 'Hard-rejects any attempt to modify immutable tracking and identity columns (id, created_at) to ensure cryptographic audit integrity.';

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
    IF public.get_user_role() != 'admin' THEN
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
COMMENT ON FUNCTION public.protect_profile_role() IS 'Locks the role and approval columns (role, is_approved, approved_by, approved_at) against non-admin mutation. Admins flip is_approved via the approve_educator SECURITY DEFINER function, which bypasses this trigger only for that single column write.';

CREATE OR REPLACE FUNCTION public.protect_forum_post_ownership()
RETURNS TRIGGER AS $$
BEGIN
    IF public.get_user_role() != 'admin' THEN
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
COMMENT ON FUNCTION public.protect_forum_post_ownership() IS 'Prevents users and educators from tampering with the original authorship or class association of a forum post.';

CREATE OR REPLACE FUNCTION public.protect_forum_post_upvotes()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.upvotes IS DISTINCT FROM OLD.upvotes AND public.get_user_role() != 'admin' THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Direct manipulation of upvote counts is prohibited. Insert into forum_post_upvotes instead.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION public.protect_forum_post_upvotes() IS 'Hard-rejects direct UPDATEs to the denormalized forum_posts.upvotes column by non-admins. Legitimate increments and decrements flow through the forum_post_upvotes ledger and are detected via pg_trigger_depth().';

CREATE OR REPLACE FUNCTION public.validate_forum_post_video_class()
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
COMMENT ON FUNCTION public.validate_forum_post_video_class() IS 'Closes the cross-class loophole left open by chk_forum_post_video_context: when a post references a video, that video''s grandparent class must equal the post''s class. CHECK constraints cannot reach across tables, hence the trigger. The UPDATE-path early-exit is wrapped in a nested IF (rather than a single conjoined expression) because PostgreSQL does not guarantee short-circuit evaluation, so OLD must only be referenced inside an explicit TG_OP = ''UPDATE'' branch.';

CREATE OR REPLACE FUNCTION public.protect_video_class_lineage()
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
COMMENT ON FUNCTION public.protect_video_class_lineage() IS 'Prevents a video from being reparented to a subtopic whose grandparent class differs from the original, while forum_posts still reference it. Without this, moving a video could silently invalidate the forum_post -> video class invariant enforced by validate_forum_post_video_class.';

CREATE OR REPLACE FUNCTION public.protect_subtopic_class_lineage()
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
COMMENT ON FUNCTION public.protect_subtopic_class_lineage() IS 'Mirrors protect_video_class_lineage one level up: blocks subtopic reparenting that would alter the class lineage of any video bound to a forum_post.';

CREATE OR REPLACE FUNCTION public.protect_topic_class_lineage()
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
COMMENT ON FUNCTION public.protect_topic_class_lineage() IS 'Top of the class-lineage protection chain: blocks topic reassignment that would alter the class of any video bound to a forum_post.';

/* Apply anti-tampering to all tables */
CREATE TRIGGER enforce_immutability_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE public.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_classes BEFORE UPDATE ON classes FOR EACH ROW EXECUTE PROCEDURE public.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_topics BEFORE UPDATE ON topics FOR EACH ROW EXECUTE PROCEDURE public.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_subtopics BEFORE UPDATE ON subtopics FOR EACH ROW EXECUTE PROCEDURE public.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_videos BEFORE UPDATE ON videos FOR EACH ROW EXECUTE PROCEDURE public.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_resources BEFORE UPDATE ON resources FOR EACH ROW EXECUTE PROCEDURE public.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_announcements BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE PROCEDURE public.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_forum_posts BEFORE UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE public.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_forum_replies BEFORE UPDATE ON forum_replies FOR EACH ROW EXECUTE PROCEDURE public.prevent_immutable_modifications();

/* Apply specific column protection triggers */
CREATE TRIGGER enforce_role_security BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE public.protect_profile_role();
CREATE TRIGGER enforce_forum_post_security BEFORE UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE public.protect_forum_post_ownership();
CREATE TRIGGER enforce_upvote_count_integrity BEFORE UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE public.protect_forum_post_upvotes();
CREATE TRIGGER enforce_forum_post_video_class BEFORE INSERT OR UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE public.validate_forum_post_video_class();
CREATE TRIGGER enforce_video_class_lineage BEFORE UPDATE ON videos FOR EACH ROW EXECUTE PROCEDURE public.protect_video_class_lineage();
CREATE TRIGGER enforce_subtopic_class_lineage BEFORE UPDATE ON subtopics FOR EACH ROW EXECUTE PROCEDURE public.protect_subtopic_class_lineage();
CREATE TRIGGER enforce_topic_class_lineage BEFORE UPDATE ON topics FOR EACH ROW EXECUTE PROCEDURE public.protect_topic_class_lineage();

/* ==========  SECURITY HELPER FUNCTIONS  ========== */

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role AS $$
DECLARE
    v_role public.user_role;
    v_is_approved BOOLEAN;
BEGIN
    SELECT role, is_approved INTO v_role, v_is_approved
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_role IS NULL THEN
        RETURN 'student'::public.user_role;
    END IF;

    IF v_role = 'educator'::public.user_role AND v_is_approved = FALSE THEN
        RETURN 'student'::public.user_role;
    END IF;

    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
COMMENT ON FUNCTION public.get_user_role() IS 'Returns the EFFECTIVE authorisation level of the calling user. Equal to profiles.role except that unapproved educators (role = educator AND is_approved = FALSE) collapse back to student, so every RLS policy can keep its single-column role check without separately worrying about approval state. SECURITY DEFINER (search_path pinned) bypasses RLS on profiles and is STABLE for per-query caching.';

CREATE OR REPLACE FUNCTION public.get_user_class_ids()
RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY
        SELECT class_id FROM public.class_enrollments WHERE user_id = auth.uid()
        UNION
        SELECT id FROM public.classes WHERE educator_id = auth.uid();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
COMMENT ON FUNCTION public.get_user_class_ids() IS 'Calculates the authorization perimeter for class-bound resources, mapping a user to all enrolled or taught class IDs. Marked as STABLE for query optimization. search_path is pinned to neutralize object-shadowing attacks against SECURITY DEFINER execution.';

CREATE OR REPLACE FUNCTION public.is_class_educator(p_class_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = p_class_id AND educator_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
COMMENT ON FUNCTION public.is_class_educator(UUID) IS 'Bypasses RLS to check if the current user is the educator of a given class, preventing infinite recursion loops. search_path is pinned to neutralize object-shadowing attacks against SECURITY DEFINER execution.';

/* ==========  RLS ACTIVATION  ========== */

/* Enable RLS */
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_video_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_post_upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE educator_profiles ENABLE ROW LEVEL SECURITY;

/* Force RLS ensures even table owners respect the policies */
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE topics FORCE ROW LEVEL SECURITY;
ALTER TABLE subtopics FORCE ROW LEVEL SECURITY;
ALTER TABLE videos FORCE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;
ALTER TABLE user_video_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE forum_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE forum_replies FORCE ROW LEVEL SECURITY;
ALTER TABLE forum_post_upvotes FORCE ROW LEVEL SECURITY;
ALTER TABLE educator_profiles FORCE ROW LEVEL SECURITY;

/* ==========  ROW LEVEL SECURITY POLICIES  ========== */

/* ----- PROFILES ----- */
CREATE POLICY "Profiles_Select_SelfOrAdmin" ON profiles
    FOR SELECT USING (public.get_user_role() = 'admin' OR auth.uid() = id);
COMMENT ON POLICY "Profiles_Select_SelfOrAdmin" ON profiles IS 'Direct reads of the profiles row are deliberately restricted to the owning user or an administrator. Cross-user rendering needs (forum author names, Q&A educator badges) MUST go through the public.profiles_public view, which exposes only the columns the UI is sanctioned to display. This split makes the public surface area explicit instead of accidental.';

CREATE POLICY "Profiles_Update_SelfOrAdmin" ON profiles
    FOR UPDATE
    USING (public.get_user_role() = 'admin' OR auth.uid() = id)
    WITH CHECK (public.get_user_role() = 'admin' OR auth.uid() = id);
COMMENT ON POLICY "Profiles_Update_SelfOrAdmin" ON profiles IS 'Restricts profile modifications to the owning user or administrators. WITH CHECK matches USING so a self-update cannot be redirected onto another user''s row mid-flight; the anti-tampering trigger additionally locks the id column. Re-SELECT validation on the post-update row passes against Profiles_Select_SelfOrAdmin because the updater is by definition either the row owner or an admin.';

/* ----- CLASSES ----- */
CREATE POLICY "Classes_Select_Authorized" ON classes 
    FOR SELECT USING (public.get_user_role() = 'admin' OR id IN (SELECT public.get_user_class_ids()));
COMMENT ON POLICY "Classes_Select_Authorized" ON classes IS 'Restricts class visibility strictly to enrolled students, assigned educators, and global administrators.';

CREATE POLICY "Classes_Update_EducatorOrAdmin" ON classes 
    FOR UPDATE USING (public.get_user_role() = 'admin' OR educator_id = auth.uid());
COMMENT ON POLICY "Classes_Update_EducatorOrAdmin" ON classes IS 'Delegates class metadata modification rights to the assigned educator and administrators.';

CREATE POLICY "Classes_Insert_Admin" ON classes FOR INSERT WITH CHECK (public.get_user_role() = 'admin');
COMMENT ON POLICY "Classes_Insert_Admin" ON classes IS 'Restricts the creation of new curriculum containers to administrators.';

CREATE POLICY "Classes_Delete_Admin" ON classes FOR DELETE USING (public.get_user_role() = 'admin');
COMMENT ON POLICY "Classes_Delete_Admin" ON classes IS 'Restricts the deletion of classes to administrators to prevent accidental hierarchical cascades.';

/* ----- CLASS ENROLLMENTS ----- */
CREATE POLICY "Enrollments_Select_Authorized" ON class_enrollments 
    FOR SELECT USING (
        public.get_user_role() = 'admin' OR 
        user_id = auth.uid() OR 
        public.is_class_educator(class_id)
    );
COMMENT ON POLICY "Enrollments_Select_Authorized" ON class_enrollments IS 'Allows users to view their own enrollments, whilst granting educators visibility over their class rosters.';

CREATE POLICY "Enrollments_Insert_EducatorOrAdmin" ON class_enrollments 
    FOR INSERT WITH CHECK (
        public.get_user_role() = 'admin' OR 
        public.is_class_educator(class_id)
    );
COMMENT ON POLICY "Enrollments_Insert_EducatorOrAdmin" ON class_enrollments IS 'Restricts the addition of students to a roster exclusively to the assigned educator and administrators.';

CREATE POLICY "Enrollments_Delete_Authorized" ON class_enrollments 
    FOR DELETE USING (
        public.get_user_role() = 'admin' OR 
        user_id = auth.uid() OR 
        public.is_class_educator(class_id)
    );
COMMENT ON POLICY "Enrollments_Delete_Authorized" ON class_enrollments IS 'Permits self-unenrollment by students, and roster management by educators/administrators.';

/* ----- CURRICULUM HIERARCHY ----- */

/* TOPICS */
CREATE POLICY "Topics_Select_Authorized" ON topics 
    FOR SELECT USING (public.get_user_role() = 'admin' OR class_id IN (SELECT public.get_user_class_ids()));
COMMENT ON POLICY "Topics_Select_Authorized" ON topics IS 'Inherits visibility boundaries from the parent class enrollment status.';

CREATE POLICY "Topics_Modify_EducatorOrAdmin" ON topics 
    FOR ALL USING (
        public.get_user_role() = 'admin' OR 
        EXISTS (SELECT 1 FROM classes WHERE id = topics.class_id AND educator_id = auth.uid())
    );
COMMENT ON POLICY "Topics_Modify_EducatorOrAdmin" ON topics IS 'Delegates structural modification rights (Insert/Update/Delete) for topics to the parent class educator and administrators.';

/* SUBTOPICS */
CREATE POLICY "Subtopics_Select_Authorized" ON subtopics 
    FOR SELECT USING (
        public.get_user_role() = 'admin' OR 
        EXISTS (
            SELECT 1 FROM topics t 
            WHERE t.id = subtopics.topic_id AND t.class_id IN (SELECT public.get_user_class_ids())
        )
    );
COMMENT ON POLICY "Subtopics_Select_Authorized" ON subtopics IS 'Inherits visibility boundaries from the parent topic hierarchy via an EXISTS join.';

CREATE POLICY "Subtopics_Modify_EducatorOrAdmin" ON subtopics 
    FOR ALL USING (
        public.get_user_role() = 'admin' OR 
        EXISTS (
            SELECT 1 FROM topics t 
            JOIN classes c ON c.id = t.class_id 
            WHERE t.id = subtopics.topic_id AND c.educator_id = auth.uid()
        )
    );
COMMENT ON POLICY "Subtopics_Modify_EducatorOrAdmin" ON subtopics IS 'Delegates structural modification rights (Insert/Update/Delete) for subtopics to the parent class educator via hierarchical resolution.';

/* VIDEOS */
CREATE POLICY "Videos_Select_Authorized" ON videos 
    FOR SELECT USING (
        public.get_user_role() = 'admin' OR 
        EXISTS (
            SELECT 1 FROM subtopics s 
            JOIN topics t ON t.id = s.topic_id 
            WHERE s.id = videos.subtopic_id AND t.class_id IN (SELECT public.get_user_class_ids())
        )
    );
COMMENT ON POLICY "Videos_Select_Authorized" ON videos IS 'Inherits visibility boundaries from the parent curriculum structure.';

CREATE POLICY "Videos_Modify_EducatorOrAdmin" ON videos 
    FOR ALL USING (
        public.get_user_role() = 'admin' OR 
        EXISTS (
            SELECT 1 FROM subtopics s 
            JOIN topics t ON t.id = s.topic_id 
            JOIN classes c ON c.id = t.class_id 
            WHERE s.id = videos.subtopic_id AND c.educator_id = auth.uid()
        )
    );
COMMENT ON POLICY "Videos_Modify_EducatorOrAdmin" ON videos IS 'Delegates video asset management (Insert/Update/Delete) to the parent class educator via hierarchical resolution.';

/* RESOURCES */
CREATE POLICY "Resources_Select_Authorized" ON resources 
    FOR SELECT USING (
        public.get_user_role() = 'admin' OR 
        EXISTS (SELECT 1 FROM topics t WHERE t.id = resources.topic_id AND t.class_id IN (SELECT public.get_user_class_ids())) OR
        EXISTS (
            SELECT 1 FROM subtopics s 
            JOIN topics t ON t.id = s.topic_id 
            WHERE s.id = resources.subtopic_id AND t.class_id IN (SELECT public.get_user_class_ids())
        )
    );
COMMENT ON POLICY "Resources_Select_Authorized" ON resources IS 'Resolves visibility boundaries dynamically depending on whether the resource is bound to a topic or a subtopic.';

CREATE POLICY "Resources_Modify_EducatorOrAdmin" ON resources 
    FOR ALL USING (
        public.get_user_role() = 'admin' OR 
        EXISTS (
            SELECT 1 FROM topics t 
            JOIN classes c ON c.id = t.class_id 
            WHERE t.id = resources.topic_id AND c.educator_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM subtopics s 
            JOIN topics t ON t.id = s.topic_id 
            JOIN classes c ON c.id = t.class_id 
            WHERE s.id = resources.subtopic_id AND c.educator_id = auth.uid()
        )
    );
COMMENT ON POLICY "Resources_Modify_EducatorOrAdmin" ON resources IS 'Delegates file asset management to the parent class educator, dynamically evaluating the polymorphic parent linkage.';

/* ----- USER VIDEO PROGRESS ----- */
CREATE POLICY "Progress_Select_Authorized" ON user_video_progress 
    FOR SELECT USING (
        public.get_user_role() = 'admin' OR 
        user_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM videos v 
            JOIN subtopics s ON s.id = v.subtopic_id 
            JOIN topics t ON t.id = s.topic_id 
            JOIN classes c ON c.id = t.class_id 
            WHERE v.id = user_video_progress.video_id AND c.educator_id = auth.uid()
        )
    );
COMMENT ON POLICY "Progress_Select_Authorized" ON user_video_progress IS 'Permits students to fetch their own telemetry state, while granting educators visibility over analytics for their owned classes.';

CREATE POLICY "Progress_Insert_Self" ON user_video_progress 
    FOR INSERT WITH CHECK (user_id = auth.uid());
COMMENT ON POLICY "Progress_Insert_Self" ON user_video_progress IS 'Restricts generation of playback telemetry strictly to the authenticated user generating the state.';

CREATE POLICY "Progress_Update_Self" ON user_video_progress 
    FOR UPDATE USING (user_id = auth.uid());
COMMENT ON POLICY "Progress_Update_Self" ON user_video_progress IS 'Restricts updating of playback telemetry strictly to the authenticated user generating the state.';

/* ----- ANNOUNCEMENTS & FORUMS ----- */
CREATE POLICY "Announcements_Select_Authorized" ON announcements 
    FOR SELECT USING (public.get_user_role() = 'admin' OR class_id IN (SELECT public.get_user_class_ids()));
COMMENT ON POLICY "Announcements_Select_Authorized" ON announcements IS 'Inherits visibility boundaries from the parent class enrollment status.';

CREATE POLICY "Announcements_Insert_Author" ON announcements 
    FOR INSERT WITH CHECK (
        public.get_user_role() = 'admin' OR 
        (author_id = auth.uid() AND EXISTS (SELECT 1 FROM classes WHERE id = announcements.class_id AND educator_id = auth.uid()))
    );
COMMENT ON POLICY "Announcements_Insert_Author" ON announcements IS 'Secures unidirectional broadcast capability exclusively to the assigned class educator and administrators.';

CREATE POLICY "Announcements_Update_Author" ON announcements
    FOR UPDATE USING (public.get_user_role() = 'admin' OR author_id = auth.uid());
COMMENT ON POLICY "Announcements_Update_Author" ON announcements IS 'Grants broadcast modification rights strictly to the original authoring educator or global administrators. Scoped to UPDATE only — INSERT remains exclusively governed by Announcements_Insert_Author so enrolled students cannot self-author announcements via permissive policy ORing.';

CREATE POLICY "Announcements_Delete_Author" ON announcements
    FOR DELETE USING (public.get_user_role() = 'admin' OR author_id = auth.uid());
COMMENT ON POLICY "Announcements_Delete_Author" ON announcements IS 'Grants broadcast deletion rights strictly to the original authoring educator or global administrators.';

/* FORUM POSTS */
CREATE POLICY "ForumPosts_Select_Authorized" ON forum_posts 
    FOR SELECT USING (public.get_user_role() = 'admin' OR class_id IN (SELECT public.get_user_class_ids()));
COMMENT ON POLICY "ForumPosts_Select_Authorized" ON forum_posts IS 'Confines discussion visibility strictly to users enrolled in or teaching the related class.';

CREATE POLICY "ForumPosts_Insert_Authorized" ON forum_posts 
    FOR INSERT WITH CHECK (
        author_id = auth.uid() AND 
        (public.get_user_role() = 'admin' OR class_id IN (SELECT public.get_user_class_ids()))
    );
COMMENT ON POLICY "ForumPosts_Insert_Authorized" ON forum_posts IS 'Permits thread creation by explicitly enforcing the author identity and validating active class enrollment.';

CREATE POLICY "ForumPosts_Update_Authorized" ON forum_posts 
    FOR UPDATE USING (
        public.get_user_role() = 'admin' OR 
        author_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM classes WHERE id = forum_posts.class_id AND educator_id = auth.uid())
    );
COMMENT ON POLICY "ForumPosts_Update_Authorized" ON forum_posts IS 'Grants editing rights to authors and educators. Anti-tampering triggers prevent authors from hijacking posts or moving classes.';

CREATE POLICY "ForumPosts_Delete_Authorized" ON forum_posts 
    FOR DELETE USING (
        public.get_user_role() = 'admin' OR 
        author_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM classes WHERE id = forum_posts.class_id AND educator_id = auth.uid())
    );
COMMENT ON POLICY "ForumPosts_Delete_Authorized" ON forum_posts IS 'Permits content deletion by the original author, acting educators (for moderation), or global administrators.';

/* FORUM REPLIES */
CREATE POLICY "ForumReplies_Select_Authorized" ON forum_replies 
    FOR SELECT USING (
        public.get_user_role() = 'admin' OR 
        EXISTS (
            SELECT 1 FROM forum_posts fp 
            WHERE fp.id = forum_replies.post_id AND fp.class_id IN (SELECT public.get_user_class_ids())
        )
    );
COMMENT ON POLICY "ForumReplies_Select_Authorized" ON forum_replies IS 'Resolves reply visibility dynamically by validating access to the parent post context.';

CREATE POLICY "ForumReplies_Insert_Authorized" ON forum_replies 
    FOR INSERT WITH CHECK (
        author_id = auth.uid() AND 
        (
            public.get_user_role() = 'admin' OR 
            EXISTS (
                SELECT 1 FROM forum_posts fp 
                WHERE fp.id = forum_replies.post_id AND fp.class_id IN (SELECT public.get_user_class_ids())
            )
        )
    );
COMMENT ON POLICY "ForumReplies_Insert_Authorized" ON forum_replies IS 'Permits reply creation by enforcing author identity and validating access to the parent post context.';

CREATE POLICY "ForumReplies_Update_Author" ON forum_replies 
    FOR UPDATE USING (public.get_user_role() = 'admin' OR author_id = auth.uid());
COMMENT ON POLICY "ForumReplies_Update_Author" ON forum_replies IS 'Strictly isolates reply editing capabilities to the original author, preventing educators from modifying student discourse.';

CREATE POLICY "ForumReplies_Delete_Authorized" ON forum_replies
    FOR DELETE USING (
        public.get_user_role() = 'admin' OR
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM forum_posts fp
            JOIN classes c ON c.id = fp.class_id
            WHERE fp.id = forum_replies.post_id AND c.educator_id = auth.uid()
        )
    );
COMMENT ON POLICY "ForumReplies_Delete_Authorized" ON forum_replies IS 'Permits reply deletion by the original author, acting educators (for moderation), or global administrators.';

/* ----- FORUM POST UPVOTES ----- */
CREATE POLICY "ForumPostUpvotes_Select_Authorized" ON forum_post_upvotes
    FOR SELECT USING (
        public.get_user_role() = 'admin' OR
        EXISTS (
            SELECT 1 FROM forum_posts fp
            WHERE fp.id = forum_post_upvotes.post_id AND fp.class_id IN (SELECT public.get_user_class_ids())
        )
    );
COMMENT ON POLICY "ForumPostUpvotes_Select_Authorized" ON forum_post_upvotes IS 'Mirrors forum post visibility — endorsements are visible only to users authorised to access the parent post context.';

CREATE POLICY "ForumPostUpvotes_Insert_Self" ON forum_post_upvotes
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM forum_posts fp
            WHERE fp.id = forum_post_upvotes.post_id AND fp.class_id IN (SELECT public.get_user_class_ids())
        )
    );
COMMENT ON POLICY "ForumPostUpvotes_Insert_Self" ON forum_post_upvotes IS 'Permits a user to register a single endorsement against a post within their authorisation perimeter. The composite primary key structurally prevents duplicate votes.';

CREATE POLICY "ForumPostUpvotes_Delete_Self" ON forum_post_upvotes
    FOR DELETE USING (public.get_user_role() = 'admin' OR user_id = auth.uid());
COMMENT ON POLICY "ForumPostUpvotes_Delete_Self" ON forum_post_upvotes IS 'Permits self-rescission of an endorsement, alongside administrative override for moderation.';

CREATE OR REPLACE FUNCTION public.approve_educator(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    IF public.get_user_role() != 'admin' THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Only admins can approve educators.';
    END IF;

    UPDATE public.profiles
    SET is_approved = TRUE,
        approved_by = auth.uid(),
        approved_at = NOW()
    WHERE id = p_user_id
      AND role = 'educator'::public.user_role
      AND is_approved = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % is not a pending educator.', p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
COMMENT ON FUNCTION public.approve_educator(UUID) IS 'Flips is_approved on the target educator profile and stamps the audit columns (approved_by / approved_at). SECURITY DEFINER (search_path pinned) bypasses the protect_profile_role trigger; the function itself enforces the admin-only caller check.';

/* ----- EDUCATOR PROFILES ----- */
CREATE POLICY "EducatorProfiles_Select_SelfOrAdmin" ON educator_profiles
    FOR SELECT USING (public.get_user_role() = 'admin' OR auth.uid() = educator_id);
COMMENT ON POLICY "EducatorProfiles_Select_SelfOrAdmin" ON educator_profiles IS 'The educator owns their row; admins can read every row to support approval review. Public promotion surfaces (future feature) will read through a SECURITY DEFINER function or a dedicated view rather than this policy.';

CREATE POLICY "EducatorProfiles_Insert_Self" ON educator_profiles
    FOR INSERT WITH CHECK (
        auth.uid() = educator_id
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'educator'::public.user_role
        )
    );
COMMENT ON POLICY "EducatorProfiles_Insert_Self" ON educator_profiles IS 'Only the owning educator can create their row, and only if their literal profile role is educator (covers both pending and approved educators; students cannot insert).';

CREATE POLICY "EducatorProfiles_Update_Self" ON educator_profiles
    FOR UPDATE
    USING (auth.uid() = educator_id)
    WITH CHECK (auth.uid() = educator_id);
COMMENT ON POLICY "EducatorProfiles_Update_Self" ON educator_profiles IS 'Educators may keep updating their own application info indefinitely. WITH CHECK matches USING so the row cannot be redirected onto another educator mid-update.';

CREATE POLICY "EducatorProfiles_Delete_SelfOrAdmin" ON educator_profiles
    FOR DELETE USING (public.get_user_role() = 'admin' OR auth.uid() = educator_id);
COMMENT ON POLICY "EducatorProfiles_Delete_SelfOrAdmin" ON educator_profiles IS 'Educator can wipe their extended info; admin can clean it up if needed.';
