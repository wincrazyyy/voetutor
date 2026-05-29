/* ==========  02_schema.sql  ==========
   Tables, indexes, the profiles_public view, table triggers, and the
   on_auth_user_created trigger on auth.users. All trigger functions
   are pre-created in 01_functions.sql; these statements just bind
   them to the right tables. New tables also need RLS enabled in
   03_rls.sql alongside their policies. */

/* ==========  PROFILES & RBAC  ========== */

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    first_name TEXT CHECK (first_name IS NULL OR char_length(first_name) <= 100),
    last_name TEXT CHECK (last_name IS NULL OR char_length(last_name) <= 100),
    display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) <= 100),
    role user_role DEFAULT 'student'::user_role NOT NULL,
    is_approved BOOLEAN DEFAULT TRUE NOT NULL,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE profiles IS 'Extended user profile data maintaining a strict 1:1 relationship with the external authentication provider.';
COMMENT ON COLUMN profiles.role IS 'Literal role declared at signup. Note: this is NOT the effective authorisation level — read internal.get_user_role() instead, which folds unapproved educators back to ''student''.';
COMMENT ON COLUMN profiles.is_approved IS 'Approval gate. Defaults to TRUE for students (no review needed) and is forced to FALSE by internal.handle_new_user when intended_role is educator. Only an admin may flip this column (enforced by internal.protect_profile_role).';
COMMENT ON COLUMN profiles.approved_by IS 'The admin who flipped is_approved from FALSE to TRUE, captured for audit trail. Set automatically by approve_educator().';

CREATE INDEX idx_profiles_approved_by ON profiles(approved_by);

CREATE INDEX idx_profiles_educator_pending
    ON profiles(created_at)
    WHERE role = 'educator'::user_role AND is_approved = FALSE;
COMMENT ON INDEX idx_profiles_educator_pending IS 'Partial index supporting the admin-approval queue (getPendingEducators, getPendingEducatorCount). Only indexes pending educator rows, which is a tiny slice of the table — much smaller than a full index on (role, is_approved).';

CREATE INDEX idx_profiles_educator_approved
    ON profiles(approved_at DESC)
    WHERE role = 'educator'::user_role AND is_approved = TRUE;
COMMENT ON INDEX idx_profiles_educator_approved IS 'Partial index supporting the admin "approved educators" view (getApprovedEducators, ordered by approved_at DESC).';

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE internal.handle_new_user();

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

CREATE VIEW public.profiles_public
WITH (security_invoker = off) AS
SELECT id, first_name, last_name, display_name, role, is_approved
FROM public.profiles;
COMMENT ON VIEW public.profiles_public IS 'Sanctioned cross-user projection of the profiles table. Runs with security_invoker = off (deliberate — the supabase security checklist flags this as the default to avoid, but here it is the design): the view bypasses RLS on profiles and returns the listed columns regardless of who is asking. Safety comes from (a) the column list itself being the access boundary, deliberately omitting created_at/updated_at and any future sensitive fields, and (b) the SELECT GRANT being limited to the authenticated role. App code MUST JOIN against this view (not the underlying table) when rendering another user''s identity in forums, Q&A, marketplace, etc. Any column added here becomes universally readable to every authenticated user — gate via a SECURITY DEFINER function instead if per-row filtering is needed.';

GRANT SELECT ON public.profiles_public TO authenticated;

CREATE TABLE educator_profiles (
    educator_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    gender TEXT CHECK (gender IS NULL OR char_length(gender) <= 50),
    whatsapp_number TEXT CHECK (whatsapp_number IS NULL OR char_length(whatsapp_number) <= 50),
    education TEXT,
    education_degree TEXT CHECK (education_degree IS NULL OR char_length(education_degree) <= 255),
    education_major TEXT CHECK (education_major IS NULL OR char_length(education_major) <= 255),
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
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

/* ==========  CORE CURRICULUM ARCHITECTURE  ========== */

CREATE TABLE classes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(4), 'hex')
        CHECK (char_length(code) <= 50),
    title TEXT NOT NULL CHECK (char_length(title) <= 255),
    description TEXT,
    educator_id UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    price_cents INTEGER DEFAULT 0 NOT NULL CHECK (price_cents >= 0),
    currency TEXT DEFAULT 'hkd' NOT NULL CHECK (currency = 'hkd'),
    is_published BOOLEAN DEFAULT FALSE NOT NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE classes IS 'Defines top-level instructional containers within the platform hierarchy.';
COMMENT ON COLUMN classes.code IS 'System-generated short identifier (8 hex chars) used as a UI badge across the educator hub, class header, and marketplace card. Auto-filled on insert via gen_random_bytes — never asked of the educator, since identical class titles are common in the IB curriculum and a UNIQUE collision would be a confusing form error. The UNIQUE constraint remains as a safety net.';
COMMENT ON COLUMN classes.educator_id IS 'Permits NULL on deletion to preserve historical class data if an educator is removed from the system.';
COMMENT ON COLUMN classes.price_cents IS 'One-time purchase price in the smallest currency unit. 0 means the class is free; students enrol via the enroll_in_free_class RPC.';
COMMENT ON COLUMN classes.currency IS 'ISO 4217 currency code in lowercase. Locked to ''hkd'' for now; widen the CHECK when multi-currency support lands.';
COMMENT ON COLUMN classes.is_published IS 'When true the class appears in the student marketplace and accepts new enrolments. Educators flip this themselves; a future trigger will gate publishing on a connected Stripe account.';

CREATE INDEX idx_classes_educator_id ON classes(educator_id);

CREATE INDEX idx_classes_marketplace
    ON classes(published_at DESC)
    WHERE is_published = TRUE;
COMMENT ON INDEX idx_classes_marketplace IS 'Partial + ordered index supporting getPublishedClasses (WHERE is_published = true ORDER BY published_at DESC). Only indexes the marketplace-visible slice, much smaller than a full index on is_published.';

CREATE TRIGGER set_classes_updated_at
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

CREATE TRIGGER set_classes_published_at
    BEFORE INSERT OR UPDATE ON classes
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_class_published_at();

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

CREATE TABLE class_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0 AND char_length(reason) <= 1000),
    status class_report_status DEFAULT 'pending'::class_report_status NOT NULL,
    resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE class_reports IS 'User-submitted reports flagging marketplace classes for admin review (offensive title, misleading pricing, etc). Reactive moderation lever paired with the educator-self-publish flow — there is no pre-publish gate.';
COMMENT ON COLUMN class_reports.status IS 'pending: awaiting admin triage. dismissed: admin reviewed and took no action. actioned: admin took moderation action (typically unpublishing the class).';

CREATE INDEX idx_class_reports_class_id ON class_reports(class_id);
CREATE INDEX idx_class_reports_reporter_id ON class_reports(reporter_id);
CREATE INDEX idx_class_reports_resolved_by ON class_reports(resolved_by);

CREATE INDEX idx_class_reports_pending
    ON class_reports(created_at DESC)
    WHERE status = 'pending'::class_report_status;
COMMENT ON INDEX idx_class_reports_pending IS 'Partial + ordered index supporting getPendingReports (WHERE status = ''pending'' ORDER BY created_at DESC) and getPendingReportCount. Replaces the earlier full index on (status) which was wider and less useful.';

CREATE UNIQUE INDEX uniq_class_reports_pending_per_user
    ON class_reports(class_id, reporter_id)
    WHERE status = 'pending'::class_report_status;

CREATE TRIGGER set_class_reports_updated_at
    BEFORE UPDATE ON class_reports
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE topics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) <= 255),
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
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE subtopics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) <= 255),
    order_index INTEGER NOT NULL CHECK (order_index >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE subtopics IS 'Second-order structural children providing granular organisational boundaries within topics.';

CREATE INDEX idx_subtopics_topic_id ON subtopics(topic_id);

CREATE TRIGGER set_subtopics_updated_at
    BEFORE UPDATE ON subtopics
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE videos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subtopic_id UUID NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) <= 255),
    description TEXT,
    duration INTERVAL,
    video_url TEXT CHECK (video_url IS NULL OR (char_length(video_url) <= 2048 AND video_url ~* '^https://')),
    cloudflare_uid TEXT UNIQUE CHECK (cloudflare_uid IS NULL OR char_length(cloudflare_uid) <= 64),
    status video_status DEFAULT 'uploading'::video_status NOT NULL,
    thumbnail_url TEXT CHECK (thumbnail_url IS NULL OR (char_length(thumbnail_url) <= 2048 AND thumbnail_url ~* '^https://')),
    order_index INTEGER NOT NULL CHECK (order_index >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE videos IS 'Primary instructional media nodes tied strictly to subtopics.';
COMMENT ON COLUMN videos.video_url IS 'Constrained to 2048 characters matching the maximum safe limit for standardised web URLs, and required to use HTTPS transport.';
COMMENT ON COLUMN videos.cloudflare_uid IS 'Cloudflare Stream video identifier. UNIQUE so the Stream webhook can resolve a videos row from an incoming notification; NULL only for legacy or externally-hosted rows that never went through the direct-upload flow.';
COMMENT ON COLUMN videos.status IS 'Encoding lifecycle for Cloudflare Stream videos: uploading (row created, bytes in flight), then queued/processing (Cloudflare encoding), then ready (playable) or errored. The webhook is the source of truth after upload; only a ready video mints a playback token.';
COMMENT ON COLUMN videos.thumbnail_url IS 'Cloudflare-generated poster image, cached on the row so curriculum cards render without an extra Stream API call. Inline CHECK enforces the 2048-char cap and HTTPS-only transport.';

CREATE INDEX idx_videos_subtopic_id ON videos(subtopic_id);

CREATE TRIGGER set_videos_updated_at
    BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE resources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL CHECK (char_length(title) <= 255),
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    file_url TEXT NOT NULL CHECK (char_length(file_url) <= 2048 AND file_url ~* '^https://'),
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_resource_parent_exclusivity CHECK (
        (topic_id IS NOT NULL AND subtopic_id IS NULL) OR
        (topic_id IS NULL AND subtopic_id IS NOT NULL)
    )
);
COMMENT ON TABLE resources IS 'Polymorphic asset table supporting attachments to either topics or subtopics via constrained exclusivity.';
COMMENT ON COLUMN resources.size_bytes IS 'Enforces BIGINT to prevent overflow issues common with large file representations in 32-bit integers.';
COMMENT ON COLUMN resources.file_url IS 'Required HTTPS URL up to 2048 characters; the inline CHECK enforces both the length cap and the protocol restriction.';
COMMENT ON CONSTRAINT chk_resource_parent_exclusivity ON resources IS 'Guarantees the structural integrity of the asset hierarchy by acting as an XOR gate.';

CREATE INDEX idx_resources_topic_id ON resources(topic_id);
CREATE INDEX idx_resources_subtopic_id ON resources(subtopic_id);

CREATE TRIGGER set_resources_updated_at
    BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

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
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

/* ==========  COMMUNICATIONS & FORUM  ========== */

CREATE TABLE announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) <= 255),
    content TEXT NOT NULL,
    type announcement_type DEFAULT 'standard'::announcement_type NOT NULL,
    link_title TEXT CHECK (link_title IS NULL OR char_length(link_title) <= 255),
    link_url TEXT CHECK (link_url IS NULL OR (char_length(link_url) <= 2048 AND link_url ~* '^https://')),
    image_alt TEXT CHECK (image_alt IS NULL OR char_length(image_alt) <= 255),
    image_url TEXT CHECK (image_url IS NULL OR (char_length(image_url) <= 2048 AND image_url ~* '^https://')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE announcements IS 'Unidirectional broadcast payloads distributed from administrators/educators to enrolled users.';
COMMENT ON COLUMN announcements.link_url IS 'Optional outbound link. Inline CHECK enforces both 2048-char cap and HTTPS-only transport.';
COMMENT ON COLUMN announcements.image_url IS 'Optional inline image. Inline CHECK enforces both 2048-char cap and HTTPS-only transport.';

CREATE INDEX idx_announcements_class_id ON announcements(class_id);
CREATE INDEX idx_announcements_author_id ON announcements(author_id);

CREATE TRIGGER set_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE forum_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    type forum_post_type DEFAULT 'general'::forum_post_type NOT NULL,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) <= 255),
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
    FOR EACH ROW EXECUTE PROCEDURE internal.set_forum_post_updated_at();

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
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE forum_post_upvotes (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    post_id UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, post_id)
);
COMMENT ON TABLE forum_post_upvotes IS 'Authoritative ledger of forum post endorsements. The composite primary key enforces one-vote-per-user, and the table serves as the source of truth feeding the denormalized forum_posts.upvotes counter.';

CREATE INDEX idx_forum_post_upvotes_post_id ON forum_post_upvotes(post_id);

CREATE TRIGGER maintain_upvote_count_on_insert
    AFTER INSERT ON forum_post_upvotes
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_forum_post_upvote_count();

CREATE TRIGGER maintain_upvote_count_on_delete
    AFTER DELETE ON forum_post_upvotes
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_forum_post_upvote_count();

/* ==========  ANTI-TAMPERING TRIGGER BINDINGS  ========== */
/* The functions live in the internal schema (see 01_functions.sql).
   These statements bind the triggers to their respective tables. */

CREATE TRIGGER enforce_immutability_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_classes BEFORE UPDATE ON classes FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_class_reports BEFORE UPDATE ON class_reports FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_topics BEFORE UPDATE ON topics FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_subtopics BEFORE UPDATE ON subtopics FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_videos BEFORE UPDATE ON videos FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_resources BEFORE UPDATE ON resources FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_announcements BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_forum_posts BEFORE UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_forum_replies BEFORE UPDATE ON forum_replies FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_educator_profiles BEFORE UPDATE ON educator_profiles FOR EACH ROW EXECUTE PROCEDURE internal.prevent_educator_profile_modifications();

CREATE TRIGGER enforce_role_security BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE internal.protect_profile_role();
CREATE TRIGGER enforce_forum_post_security BEFORE UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE internal.protect_forum_post_ownership();
CREATE TRIGGER enforce_upvote_count_integrity BEFORE UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE internal.protect_forum_post_upvotes();
CREATE TRIGGER enforce_forum_post_video_class BEFORE INSERT OR UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE internal.validate_forum_post_video_class();
CREATE TRIGGER enforce_video_class_lineage BEFORE UPDATE ON videos FOR EACH ROW EXECUTE PROCEDURE internal.protect_video_class_lineage();
CREATE TRIGGER enforce_subtopic_class_lineage BEFORE UPDATE ON subtopics FOR EACH ROW EXECUTE PROCEDURE internal.protect_subtopic_class_lineage();
CREATE TRIGGER enforce_topic_class_lineage BEFORE UPDATE ON topics FOR EACH ROW EXECUTE PROCEDURE internal.protect_topic_class_lineage();
