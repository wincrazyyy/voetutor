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
    avatar_url TEXT CHECK (avatar_url IS NULL OR (char_length(avatar_url) <= 2048 AND avatar_url ~* '^https://')),
    role user_role DEFAULT 'student'::user_role NOT NULL,
    is_approved BOOLEAN DEFAULT TRUE NOT NULL,
    must_change_password BOOLEAN DEFAULT FALSE NOT NULL,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE profiles IS 'Extended user profile data maintaining a strict 1:1 relationship with the external authentication provider.';
COMMENT ON COLUMN profiles.role IS 'Literal role declared at signup. Note: this is NOT the effective authorisation level — read internal.get_user_role() instead, which folds unapproved educators back to ''student''.';
COMMENT ON COLUMN profiles.is_approved IS 'Approval gate. Defaults to TRUE for students (no review needed) and is forced to FALSE by internal.handle_new_user when intended_role is educator. Only an admin may flip this column (enforced by internal.protect_profile_role).';
COMMENT ON COLUMN profiles.approved_by IS 'The admin who flipped is_approved from FALSE to TRUE, captured for audit trail. Set automatically by approve_educator().';
COMMENT ON COLUMN profiles.must_change_password IS 'TRUE only for accounts provisioned by an educator/admin with a temporary password (set from signup metadata by internal.handle_new_user). While TRUE the proxy confines the signed-in user to /onboarding/set-password until they set their own password. Deliberately NOT locked by internal.protect_profile_role: the owner clears it themselves after supabase.auth.updateUser succeeds (like avatar_url). A user who clears it without changing the password only weakens their own account — the educator who provisioned it already knows the temporary password; the flag is a UX rail, not the security boundary. Never exposed via profiles_public.';
COMMENT ON COLUMN profiles.avatar_url IS 'The universal account avatar for ANY user (students included), set in Settings and uploaded to the public owner-keyed `avatars` bucket. This is the identity chip shown app-wide (navbar, forum, announcements) via profiles_public. Distinct from educator_profiles.avatar_url, which is the public sales-page masthead photo; profiles_public COALESCEs this first so a Settings avatar wins but an educator with only a masthead photo still shows it. Self-updatable (not locked by protect_profile_role); origin-pinned to the caller''s avatars/{uid}/ prefix by updateAvatarAction.';

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
    avatar_url TEXT CHECK (avatar_url IS NULL OR (char_length(avatar_url) <= 2048 AND avatar_url ~* '^https://')),
    role_label TEXT CHECK (role_label IS NULL OR char_length(role_label) <= 120),
    headline TEXT CHECK (headline IS NULL OR char_length(headline) <= 160),
    hourly_rate_cents INTEGER CHECK (hourly_rate_cents IS NULL OR hourly_rate_cents >= 0),
    subject_tags TEXT[],
    profile_doc JSONB DEFAULT '{"version":1,"sections":[]}'::jsonb NOT NULL
        CHECK (octet_length(profile_doc::text) <= 262144),
    is_published BOOLEAN DEFAULT FALSE NOT NULL,
    published_at TIMESTAMPTZ,
    tier educator_tier DEFAULT 'basic' NOT NULL,
    slug TEXT UNIQUE
        CHECK (slug IS NULL OR (char_length(slug) BETWEEN 3 AND 40 AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')),
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    review_count INTEGER DEFAULT 0 NOT NULL CHECK (review_count >= 0),
    rating_sum INTEGER DEFAULT 0 NOT NULL CHECK (rating_sum >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE educator_profiles IS 'Optional 1:1 sidecar to profiles holding application / promotion fields that only educators care about. Filled in after sign-up by the educator themselves; admins read it during approval review and surface it on the educator''s public profile page.';
COMMENT ON COLUMN educator_profiles.review_count IS 'Denormalized count of VISIBLE educator_reviews (imported-inclusive in v1). Maintained by internal.maintain_educator_review_stats; locked against direct user writes by protect_educator_admin_fields (depth-guarded). Average = rating_sum / review_count, computed at read time. v1 UI reads the aggregate off the returned review list instead; these columns are the maintained hook for the future directory-card aggregate.';
COMMENT ON COLUMN educator_profiles.self_introduction IS 'Free-form pitch the educator writes about themselves. Surfaced to admins for review and may be displayed publicly for promotion — front-end UI warns the educator to keep it serious.';
COMMENT ON COLUMN educator_profiles.profile_doc IS 'The structured, versioned public-profile body (a list of typed sections). Opaque JSONB to the DB; shape is policed in TypeScript (validateProfileDoc), never a DB CHECK — this is what keeps the tier roadmap zero-schema-churn.';
COMMENT ON COLUMN educator_profiles.hourly_rate_cents IS 'Private-tutoring rate in the smallest HKD unit. NULL means "no rate set" (rendered as "Contact for rate"), distinct from 0.';
COMMENT ON COLUMN educator_profiles.is_published IS 'When true the profile is publicly visible via get_public_educator_profile. Educators flip this themselves; published_at is trigger-stamped.';
COMMENT ON COLUMN educator_profiles.tier IS 'Commercial tier (basic / premium). Admin-controlled, locked by protect_educator_admin_fields; set via the set_educator_tier RPC. v1 treats both tiers identically (hooks only).';
COMMENT ON COLUMN educator_profiles.is_verified IS 'Admin-set trust badge. Locked by protect_educator_admin_fields; flipped via the set_educator_verified RPC.';
COMMENT ON COLUMN educator_profiles.slug IS 'Reserved vanity-URL column; stays NULL in v1 (UUID route only). A format / reserved-word CHECK ships WITH the slug setter, not now.';

CREATE TRIGGER set_educator_profiles_updated_at
    BEFORE UPDATE ON educator_profiles
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

CREATE TRIGGER set_educator_profile_published_at
    BEFORE INSERT OR UPDATE ON educator_profiles
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_educator_profile_published_at();

CREATE TRIGGER enforce_educator_admin_fields
    BEFORE INSERT OR UPDATE ON educator_profiles
    FOR EACH ROW EXECUTE PROCEDURE internal.protect_educator_admin_fields();

CREATE VIEW public.profiles_public
WITH (security_invoker = off) AS
SELECT p.id, p.first_name, p.last_name, p.display_name, p.role, p.is_approved,
       COALESCE(p.avatar_url, ep.avatar_url) AS avatar_url
FROM public.profiles p
LEFT JOIN public.educator_profiles ep ON ep.educator_id = p.id;
COMMENT ON VIEW public.profiles_public IS 'Sanctioned cross-user projection of the profiles table (LEFT JOINed to educator_profiles for the public avatar_url). Runs with security_invoker = off (deliberate — the supabase security checklist flags this as the default to avoid, but here it is the design): the view bypasses RLS on profiles AND educator_profiles and returns the listed columns regardless of who is asking. Safety comes from (a) the column list itself being the access boundary, deliberately omitting created_at/updated_at and any future sensitive fields, and (b) the SELECT GRANT being limited to the authenticated role. avatar_url is COALESCE(profiles.avatar_url, educator_profiles.avatar_url) — the Settings account avatar (public `avatars` bucket, any user) wins, falling back to the educator masthead photo; non-sensitive (already public and served from public buckets); NULL when neither is set. App code MUST JOIN against this view (not the underlying table) when rendering another user''s identity in forums, Q&A, marketplace, etc. Any column added here becomes universally readable to every authenticated user — gate via a SECURITY DEFINER function instead if per-row filtering is needed. Defined AFTER educator_profiles so db diff''s in-order rebuild can resolve the join.';

GRANT SELECT ON public.profiles_public TO authenticated;

/* ----------------------------------------- */

CREATE TABLE student_profiles (
    student_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    whatsapp_number TEXT CHECK (whatsapp_number IS NULL OR char_length(whatsapp_number) <= 50),
    school TEXT CHECK (school IS NULL OR char_length(school) <= 200),
    school_year TEXT CHECK (school_year IS NULL OR char_length(school_year) <= 60),
    target_grade TEXT CHECK (target_grade IS NULL OR char_length(target_grade) <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE student_profiles IS 'Optional 1:1 sidecar to profiles holding enrolment details that only students care about — WhatsApp number, school, school year, and target grade. Collected at sign-up (handle_new_user inserts the row from signup metadata) and self-editable in Settings. All columns are nullable so the row survives partial completion and pre-feature students who backfill later. Mirrors the educator_profiles sidecar shape.';
COMMENT ON COLUMN student_profiles.target_grade IS 'Free-text goal grade the student is aiming for (e.g. "7", "40/45", "A*").';

CREATE TRIGGER set_student_profiles_updated_at
    BEFORE UPDATE ON student_profiles
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

CREATE TRIGGER enforce_immutability_student_profiles
    BEFORE UPDATE ON student_profiles
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_student_profile_modifications();

/* ----------------------------------------- */

CREATE TABLE educator_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    educator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    student_id UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    source review_source DEFAULT 'imported'::review_source NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL CONSTRAINT educator_reviews_comment_len
        CHECK (char_length(trim(comment)) > 0 AND char_length(comment) <= 4000),
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
COMMENT ON TABLE educator_reviews IS 'Reviews / testimonials shown on an educator''s public profile. source = imported: a testimonial the educator (or an admin) carries over from outside the platform, labelled "Imported" in the UI as unverified — the v1 path and the manual legacy-migration target. source = verified: a future path for reviews written by a registered enrolled student (student_id set, identity read through profiles_public). Reviewer identity for imported rows lives in the denormalized reviewer_* columns since there is no platform account behind them.';
COMMENT ON COLUMN educator_reviews.source IS 'imported (educator-supplied, unverified, v1) or verified (registered-student-authored, future). Drives the "Imported" label and the verified/imported RLS + aggregate split.';
COMMENT ON COLUMN educator_reviews.student_id IS 'NULL for imported reviews (legacy / guest). Set only for the future verified path, where the reviewer is a real enrolled student; identity is then read through profiles_public, not the reviewer_* columns.';
COMMENT ON COLUMN educator_reviews.is_visible IS 'Moderation lever, default TRUE. Hidden reviews never reach get_public_educator_reviews and never count toward the educator_profiles aggregate. Admin-controlled via set_review_visibility.';
COMMENT ON CONSTRAINT chk_review_source_shape ON educator_reviews IS 'Imported reviews carry no student_id; verified reviews must. NOTE for the verified phase: student_id is ON DELETE SET NULL, which would violate this CHECK for a verified row when the student account is deleted — resolve before shipping verified (see plans/educator-reviews.md section 8).';

CREATE INDEX idx_educator_reviews_educator_id ON educator_reviews(educator_id);
CREATE INDEX idx_educator_reviews_student_id ON educator_reviews(student_id);

CREATE INDEX idx_educator_reviews_visible
    ON educator_reviews(educator_id, created_at DESC)
    WHERE is_visible = TRUE;
COMMENT ON INDEX idx_educator_reviews_visible IS 'Partial + ordered index for the public read slice (get_public_educator_reviews: WHERE educator_id = ? AND is_visible ORDER BY created_at DESC).';

CREATE UNIQUE INDEX uniq_educator_reviews_verified_per_student
    ON educator_reviews(educator_id, student_id)
    WHERE source = 'verified'::review_source;
COMMENT ON INDEX uniq_educator_reviews_verified_per_student IS 'One verified review per student per educator. Reserved for the verified phase; inert while no verified rows exist.';

CREATE TRIGGER set_educator_reviews_updated_at
    BEFORE UPDATE ON educator_reviews
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

CREATE TRIGGER maintain_educator_review_stats_on_insert
    AFTER INSERT ON educator_reviews
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_educator_review_stats();

CREATE TRIGGER maintain_educator_review_stats_on_update
    AFTER UPDATE ON educator_reviews
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_educator_review_stats();

CREATE TRIGGER maintain_educator_review_stats_on_delete
    AFTER DELETE ON educator_reviews
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_educator_review_stats();

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
    access_scope enrollment_access DEFAULT 'full'::enrollment_access NOT NULL,
    enrolled_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, class_id)
);
COMMENT ON TABLE class_enrollments IS 'Resolves the many-to-many relationship between users and classes. Membership identity (user_id, class_id, enrolled_at) stays immutable — locked by enforce_immutability_class_enrollments; only access_scope is mutable, by the class educator or an admin (enrollments_update_educator_or_admin), so a trial student can be upgraded in place without losing progress, forum history, or read receipts.';
COMMENT ON COLUMN class_enrollments.user_id IS 'Acts as the leading column in the primary key B-tree, implicitly indexing queries filtering strictly by user_id.';
COMMENT ON COLUMN class_enrollments.access_scope IS 'The enrollment''s content perimeter. full (default — every pre-existing writer is untouched): the student sees the whole curriculum, today''s behavior. scoped: FAIL-CLOSED explicit marker — the student sees exactly the union of the Access Passes they hold (class_pass_holders); if every held pass is deleted they see an empty curriculum (plus broadcast announcements + forum), never silently-full access. Not derived from the existence of holder rows by design.';

CREATE INDEX idx_class_enrollments_class_id ON class_enrollments(class_id);

CREATE TRIGGER enforce_immutability_class_enrollments
    BEFORE UPDATE ON class_enrollments
    FOR EACH ROW EXECUTE PROCEDURE internal.protect_enrollment_columns();

/* ----------------------------------------- */

CREATE TABLE class_passes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 80),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE class_passes IS 'A named, reusable Access Pass: a subset of one class''s curriculum (defined by class_pass_items) that an enrollment can be scoped to (via class_pass_holders + class_enrollments.access_scope = scoped). The pass is the first-class noun the educator names ("Trial — first 2 lessons", "Topics 1-3"), reuses across students, targets announcements at (announcements.pass_id), and mints scoped invite links for (class_invites.pass_id). Deleting a pass cascades its items, holders, scoped invites, and targeted announcements away — scoped students then fail closed to an empty curriculum, never silently-full access.';
COMMENT ON COLUMN class_passes.name IS 'Educator-facing label, unique per class case-insensitively (uniq_class_passes_class_name). Shown to holders on the class banner, targeted-announcement chips, and the invite landing page — the same trust surface as the class title.';
COMMENT ON COLUMN class_passes.created_by IS 'Issuer bookkeeping; ON DELETE SET NULL because the pass must keep working for its holders even if the creating account goes away.';

CREATE UNIQUE INDEX uniq_class_passes_class_name ON class_passes(class_id, lower(name));
CREATE INDEX idx_class_passes_class_id ON class_passes(class_id);
CREATE INDEX idx_class_passes_created_by ON class_passes(created_by);

CREATE TRIGGER set_class_passes_updated_at
    BEFORE UPDATE ON class_passes
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

CREATE TRIGGER enforce_immutability_class_passes
    BEFORE UPDATE ON class_passes
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();

CREATE TRIGGER enforce_pass_reparent
    BEFORE UPDATE ON class_passes
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_pass_reparent();

/* ----------------------------------------- */

CREATE TABLE class_invites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex')
        CHECK (char_length(token) BETWEEN 16 AND 128),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    pass_id UUID REFERENCES class_passes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    email TEXT CHECK (email IS NULL OR char_length(email) <= 255),
    note TEXT CHECK (note IS NULL OR char_length(note) <= 200),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    redeemed_by UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    redeemed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE class_invites IS 'Single-use, per-student invite links for manual (off-platform payment) enrollment. An educator or admin generates a secret token URL for one class and hands it to the student manually; the student redeems it via the redeem_class_invite RPC, which enrols them bypassing the marketplace. Optional email binding, optional expiry hard-capped at 7 days from creation (the RPCs enforce LEAST(COALESCE(expires_at, created_at + 7 days), created_at + 7 days), so even legacy NULL-expiry rows die within a week), revocable via revoked_at. Students never touch this table directly — the anon-callable get_class_invite_preview RPC and the authenticated redeem_class_invite RPC are the only student-facing surfaces.';
COMMENT ON COLUMN class_invites.token IS 'The invite secret: 24 random bytes hex-encoded (48 chars, 192 bits) generated by the DB default. Mirrors the classes.code gen_random_bytes pattern but secret-grade and non-enumerable. The create action inserts and reads it back via RETURNING token.';
COMMENT ON COLUMN class_invites.email IS 'Optional binding to the invitee''s email, stored lowercased by the action. NULL means anyone holding the link may redeem it — the default expectation for a manually shared secret link.';
COMMENT ON COLUMN class_invites.created_by IS 'ON DELETE SET NULL is non-essential bookkeeping: deleting an educator account deletes their classes first (deleteEducatorAccountAction), which cascades the invites away before the profile row goes.';
COMMENT ON COLUMN class_invites.redeemed_at IS 'Single-use marker. redeemed_by / redeemed_at are written only by the redeem_class_invite RPC; set means the invite is spent (idempotent for the same redeemer, rejected for anyone else).';
COMMENT ON COLUMN class_invites.pass_id IS 'NULL = full-access invite (the default, today''s behavior). Set = a SCOPED invite: redeeming enrolls the student with access_scope = scoped holding this pass. ON DELETE CASCADE (not SET NULL) is deliberate fail-closed design — SET NULL would silently escalate a trial invite into a full-access invite when the pass is deleted; cascade kills the outstanding link with the pass instead. Class membership of the pass is enforced by enforce_invite_pass_class.';

CREATE INDEX idx_class_invites_class_id ON class_invites(class_id);
CREATE INDEX idx_class_invites_pass_id ON class_invites(pass_id);
CREATE INDEX idx_class_invites_created_by ON class_invites(created_by);
CREATE INDEX idx_class_invites_redeemed_by ON class_invites(redeemed_by);

CREATE TRIGGER set_class_invites_updated_at
    BEFORE UPDATE ON class_invites
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

CREATE TRIGGER enforce_immutability_class_invites
    BEFORE UPDATE ON class_invites
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();

CREATE TRIGGER enforce_invite_pass_class
    BEFORE INSERT OR UPDATE ON class_invites
    FOR EACH ROW EXECUTE PROCEDURE internal.validate_invite_pass_class();

/* ----------------------------------------- */

CREATE TABLE student_setup_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex')
        CHECK (char_length(token) BETWEEN 16 AND 128),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    revoked_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE student_setup_tokens IS 'Durable one-click setup links for educator-provisioned student accounts. createStudentAccountAction mints a row (service role) and hands the educator a /welcome/[token] URL; the /welcome route (service role, authorized by possession of the 192-bit secret in the URL) resolves the row, mints a FRESH short-lived Supabase recovery link at click time, and hands off to /auth/confirm, landing the student signed-in on /onboarding/set-password. Deliberately reusable until profiles.must_change_password flips FALSE (the everyday spent signal — a student who bails mid-flow can re-click), consumed_at is stamped (the hard single-use backstop, written by consume_own_setup_tokens on password completion), the row is revoked, or 7 days pass since created_at (a hard cap enforced in the /welcome route — no link outlives a week, no matter what). Students never read this table; the only authenticated surface is the issuer/admin select for a future manage or resend UI.';
COMMENT ON COLUMN student_setup_tokens.token IS 'The setup secret: 24 random bytes hex-encoded (48 chars, 192 bits) generated by the DB default, same recipe as class_invites.token. The create action inserts and reads it back via RETURNING token; possession of it is what authorizes the /welcome route''s service-role handoff.';
COMMENT ON COLUMN student_setup_tokens.user_id IS 'The provisioned student account this link signs in. Cascade-deleted with the profile, so a deleted account can never be resurrected through a stale link.';
COMMENT ON COLUMN student_setup_tokens.created_by IS 'Issuer bookkeeping (the educator or admin who provisioned the account); ON DELETE SET NULL because the link must keep working for the student even if the issuing account goes away.';
COMMENT ON COLUMN student_setup_tokens.revoked_at IS 'Manual kill switch for a mis-sent link (service-role or admin write; no UI yet). The everyday expiry is NOT this column — it is profiles.must_change_password flipping FALSE plus the consumed_at hard-consume, and every token additionally hard-expires 7 days after created_at (enforced in the /welcome route).';
COMMENT ON COLUMN student_setup_tokens.consumed_at IS 'Stamped once the student completes first-password setup (via the consume_own_setup_tokens RPC called by the set-password form). Hard single-use signal, independent of the owner-clearable profiles.must_change_password flag; the /welcome route treats a non-NULL consumed_at as spent. Deliberately mutable — enforce_immutability_student_setup_tokens locks only id/created_at.';

CREATE INDEX idx_student_setup_tokens_user_id ON student_setup_tokens(user_id);
CREATE INDEX idx_student_setup_tokens_class_id ON student_setup_tokens(class_id);
CREATE INDEX idx_student_setup_tokens_created_by ON student_setup_tokens(created_by);

CREATE TRIGGER enforce_immutability_student_setup_tokens
    BEFORE UPDATE ON student_setup_tokens
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();

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
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) <= 255),
    description TEXT,
    duration INTERVAL,
    video_url TEXT CHECK (video_url IS NULL OR (char_length(video_url) <= 2048 AND video_url ~* '^https://')),
    cloudflare_uid TEXT UNIQUE CHECK (cloudflare_uid IS NULL OR char_length(cloudflare_uid) <= 64),
    status video_status DEFAULT 'uploading'::video_status NOT NULL,
    thumbnail_url TEXT CHECK (thumbnail_url IS NULL OR (char_length(thumbnail_url) <= 2048 AND thumbnail_url ~* '^https://')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE videos IS 'Educator-owned library of instructional media. A video exists independently of the curriculum and is surfaced inside classes through video_placements (many-to-many), so one video can appear in several subtopics across several of the owning educator''s classes.';
COMMENT ON COLUMN videos.owner_id IS 'The educator who owns this library video. Edit/delete and placement rights resolve directly from this column rather than through the curriculum hierarchy, since a video may be placed into many classes or none.';
COMMENT ON COLUMN videos.video_url IS 'Constrained to 2048 characters matching the maximum safe limit for standardised web URLs, and required to use HTTPS transport.';
COMMENT ON COLUMN videos.cloudflare_uid IS 'Cloudflare Stream video identifier. UNIQUE so the Stream webhook can resolve a videos row from an incoming notification; NULL only for legacy or externally-hosted rows that never went through the direct-upload flow.';
COMMENT ON COLUMN videos.status IS 'Encoding lifecycle for Cloudflare Stream videos: uploading (row created, bytes in flight), then queued/processing (Cloudflare encoding), then ready (playable) or errored. The webhook is the source of truth after upload; only a ready video mints a playback token.';
COMMENT ON COLUMN videos.thumbnail_url IS 'Cloudflare-generated poster image, cached on the row so curriculum cards render without an extra Stream API call. Inline CHECK enforces the 2048-char cap and HTTPS-only transport.';

CREATE INDEX idx_videos_owner_id ON videos(owner_id);

CREATE TRIGGER set_videos_updated_at
    BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE video_placements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE ON UPDATE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    order_index INTEGER NOT NULL CHECK (order_index >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_video_placement_parent CHECK ((topic_id IS NOT NULL) <> (subtopic_id IS NOT NULL))
);
COMMENT ON TABLE video_placements IS 'Join table placing library videos into the curriculum: each row surfaces one video inside one curriculum node (a topic OR a subtopic, never both) at a given order_index. The many-to-many design lets a single video appear in multiple nodes across the owning educator''s classes (overlap) — e.g. a topic-level intro video plus per-subtopic lessons. Deleting the parent topic/subtopic removes the placement only — the underlying library video survives; deleting a video removes all its placements.';
COMMENT ON CONSTRAINT chk_video_placement_parent ON video_placements IS 'XOR gate: a placement hangs off exactly one of topic_id / subtopic_id. Mirrors the resources / resource_placements parent exclusivity.';
COMMENT ON COLUMN video_placements.order_index IS 'Position of the video within its parent node''s ordered list. Not unique; the curriculum sorts by it and the educator reorders via drag-and-drop. The partial unique indexes block placing the same video into one node twice.';

CREATE UNIQUE INDEX uniq_video_placements_subtopic ON video_placements(video_id, subtopic_id) WHERE subtopic_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_video_placements_topic ON video_placements(video_id, topic_id) WHERE topic_id IS NOT NULL;
CREATE INDEX idx_video_placements_subtopic_id ON video_placements(subtopic_id);
CREATE INDEX idx_video_placements_topic_id ON video_placements(topic_id);
CREATE INDEX idx_video_placements_video_id ON video_placements(video_id);

/* ----------------------------------------- */

CREATE TABLE resources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) <= 255),
    description TEXT,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    file_url TEXT NOT NULL CHECK (char_length(file_url) <= 2048),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE resources IS 'Educator-owned library of PDF notes, keyed by owner_id (FK to profiles) — a note exists independently of the curriculum and is surfaced inside classes through resource_placements (many-to-many), so one note can appear in several topics/subtopics across several of the owning educator''s classes. Mirrors the videos / video_placements library model. Branded "Notes" in the UI.';
COMMENT ON COLUMN resources.owner_id IS 'The educator who owns this library note. Edit/delete and placement rights resolve directly from this column rather than through the curriculum hierarchy, since a note may be placed into many classes or none.';
COMMENT ON COLUMN resources.size_bytes IS 'Enforces BIGINT to prevent overflow issues common with large file representations in 32-bit integers.';
COMMENT ON COLUMN resources.file_url IS 'The Cloudflare R2 object KEY for the notes PDF, of the form {owner_id}/{uuid}.pdf (an owner-keyed object in the app-gated R2 notes bucket — R2 has no per-user RLS, so the app is the sole gatekeeper). Length-capped at 2048; the protocol CHECK was dropped when the bytes moved off Supabase Storage to R2. Downloads go through /api/resources/[id]/download, which RLS-checks the row then 302s to a short-lived R2 presigned GET — never a direct public read. See plans/r2-notes-migration.md.';

CREATE INDEX idx_resources_owner_id ON resources(owner_id);

CREATE TRIGGER set_resources_updated_at
    BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

/* ----------------------------------------- */

CREATE TABLE resource_placements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE ON UPDATE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    order_index INTEGER NOT NULL CHECK (order_index >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_resource_placement_parent CHECK ((topic_id IS NOT NULL) <> (subtopic_id IS NOT NULL))
);
COMMENT ON TABLE resource_placements IS 'Join table placing library notes (resources) into the curriculum: each row surfaces one note inside one curriculum node (a topic OR a subtopic, never both) at a given order_index. Mirrors video_placements. The many-to-many design lets a single note appear in multiple nodes across the owning educator''s classes (overlap). Deleting the parent topic/subtopic removes the placement only — the underlying library note survives; deleting a note removes all its placements. Notes are never referenced by forum_posts, so (unlike video_placements) there is no forum-lineage trigger.';
COMMENT ON CONSTRAINT chk_resource_placement_parent ON resource_placements IS 'XOR gate: a placement hangs off exactly one of topic_id / subtopic_id.';

CREATE UNIQUE INDEX uniq_resource_placements_subtopic ON resource_placements(resource_id, subtopic_id) WHERE subtopic_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_resource_placements_topic ON resource_placements(resource_id, topic_id) WHERE topic_id IS NOT NULL;
CREATE INDEX idx_resource_placements_subtopic_id ON resource_placements(subtopic_id);
CREATE INDEX idx_resource_placements_topic_id ON resource_placements(topic_id);
CREATE INDEX idx_resource_placements_resource_id ON resource_placements(resource_id);

/* ==========  ACCESS PASS CONTENTS & HOLDERS  ==========
   class_pass_items FKs topics / subtopics / videos / resources, so it is
   defined here — after every curriculum table — for db diff's in-order
   rebuild. The class_passes table itself lives just after class_enrollments
   (before class_invites, which references it). */

CREATE TABLE class_pass_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pass_id UUID NOT NULL REFERENCES class_passes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE ON UPDATE CASCADE,
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE ON UPDATE CASCADE,
    resource_id UUID REFERENCES resources(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_pass_item_shape CHECK (
        (topic_id IS NOT NULL)::int + (subtopic_id IS NOT NULL)::int
        + (video_id IS NOT NULL)::int + (resource_id IS NOT NULL)::int = 1
    )
);
COMMENT ON TABLE class_pass_items IS 'What an Access Pass grants — polymorphic 4-way XOR rows (chk_pass_item_shape): a topic grant covers the topic, ALL its subtopics, and every placement under any of them (including content added later); a subtopic grant covers the subtopic and its placements (and reveals the parent topic row for rendering); a video / resource grant covers that LIBRARY ITEM wherever it is placed in this class (and reveals the ancestor rows). Item grants are deliberately keyed by library-item id, NOT video_placements.id — placements churn under the drag-and-drop board and a grant must survive that; a granted item whose last placement in the class is removed simply grants nothing (fail-closed dangling grant, harmless). Cross-class integrity is enforced by enforce_pass_item_class.';
COMMENT ON CONSTRAINT chk_pass_item_shape ON class_pass_items IS '4-way XOR: exactly one of topic_id / subtopic_id / video_id / resource_id is set per item row.';

CREATE UNIQUE INDEX uniq_pass_items_topic    ON class_pass_items(pass_id, topic_id)    WHERE topic_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_pass_items_subtopic ON class_pass_items(pass_id, subtopic_id) WHERE subtopic_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_pass_items_video    ON class_pass_items(pass_id, video_id)    WHERE video_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_pass_items_resource ON class_pass_items(pass_id, resource_id) WHERE resource_id IS NOT NULL;
CREATE INDEX idx_pass_items_pass_id     ON class_pass_items(pass_id);
CREATE INDEX idx_pass_items_topic_id    ON class_pass_items(topic_id);
CREATE INDEX idx_pass_items_subtopic_id ON class_pass_items(subtopic_id);
CREATE INDEX idx_pass_items_video_id    ON class_pass_items(video_id);
CREATE INDEX idx_pass_items_resource_id ON class_pass_items(resource_id);

CREATE TRIGGER enforce_pass_item_class
    BEFORE INSERT OR UPDATE ON class_pass_items
    FOR EACH ROW EXECUTE PROCEDURE internal.validate_pass_item_class();

CREATE TRIGGER enforce_immutability_class_pass_items
    BEFORE UPDATE ON class_pass_items
    FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();

/* ----------------------------------------- */

CREATE TABLE class_pass_holders (
    user_id UUID NOT NULL,
    class_id UUID NOT NULL,
    pass_id UUID NOT NULL REFERENCES class_passes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, class_id, pass_id),
    FOREIGN KEY (user_id, class_id)
        REFERENCES class_enrollments(user_id, class_id) ON DELETE CASCADE ON UPDATE CASCADE
);
COMMENT ON TABLE class_pass_holders IS 'Which enrollment holds which Access Pass. The composite FK to class_enrollments means unenrolling (or deleting the account / class) cascades holder rows away; deleting a pass cascades its holders — and the enrollment''s access_scope = scoped marker keeps the student FAIL-CLOSED (no silent full-access escalation). Holder rows are meaningful only while access_scope = scoped; on upgrade-to-full the writers delete them (a leftover would be inert while full but would resurrect on a later downgrade). Immutable join row (composite PK, no UPDATE policy — the announcement_reads / forum_post_upvotes pattern; change = delete + insert). Pass-class agreement is enforced by enforce_pass_holder_class.';
COMMENT ON COLUMN class_pass_holders.granted_by IS 'Who granted the pass (educator, admin, or the invite issuer via redeem_class_invite); ON DELETE SET NULL bookkeeping only.';

CREATE INDEX idx_class_pass_holders_pass_user ON class_pass_holders(pass_id, user_id);
CREATE INDEX idx_class_pass_holders_class_id  ON class_pass_holders(class_id);

CREATE TRIGGER enforce_pass_holder_class
    BEFORE INSERT ON class_pass_holders
    FOR EACH ROW EXECUTE PROCEDURE internal.validate_pass_holder_class();

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

/* ----------------------------------------- */

CREATE TABLE user_class_order (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, class_id)
);
COMMENT ON TABLE user_class_order IS 'Per-user preferred ordering of the sidebar class list (enrolled students AND teaching educators). Separate from the immutable class_enrollments so ordering stays mutable and role-agnostic; consumed only by the sidebar, never the marketplace.';
COMMENT ON COLUMN user_class_order.position IS 'Zero-based sort key for the caller''s sidebar class list; classes lacking a row sort after positioned ones in their natural order.';

CREATE INDEX idx_user_class_order_class_id ON user_class_order(class_id);

CREATE TRIGGER set_user_class_order_updated_at
    BEFORE UPDATE ON user_class_order
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
    event_at TIMESTAMPTZ,
    pass_id UUID REFERENCES class_passes(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_announcement_event_at CHECK (event_at IS NULL OR type = 'event'::announcement_type)
);
COMMENT ON TABLE announcements IS 'Unidirectional broadcast payloads distributed from administrators/educators to enrolled users. pass_id NULL = broadcast to the whole class (the default); set = targeted at the holders of one Access Pass (plus the class educator / admins), enforced by the select policy.';
COMMENT ON COLUMN announcements.event_at IS 'When the event happens (event-type announcements only — chk_announcement_event_at enforces NULL for standard/important). Stored as TIMESTAMPTZ; rendered in the viewer''s local timezone client-side.';
COMMENT ON COLUMN announcements.link_url IS 'Optional outbound link. Inline CHECK enforces both 2048-char cap and HTTPS-only transport.';
COMMENT ON COLUMN announcements.image_url IS 'Optional inline image. Inline CHECK enforces both 2048-char cap and HTTPS-only transport.';
COMMENT ON COLUMN announcements.pass_id IS 'NULL = broadcast to the whole class (default — every pre-existing row stays broadcast). Set = visible only to the class educator, admins, and holders of that pass (announcements_select_authorized). ON DELETE CASCADE: a targeted announcement dies with its audience — an orphaned targeted message shown to nobody, or worse silently flipped to broadcast, would both be wrong. One pass per announcement in v1 (post once per pass for multi-audience). Class membership of the pass is enforced by enforce_announcement_pass_class; audience is create-time-only in the app (updateAnnouncementAction does not accept it).';

CREATE INDEX idx_announcements_class_id ON announcements(class_id);
CREATE INDEX idx_announcements_author_id ON announcements(author_id);
CREATE INDEX idx_announcements_pass_id ON announcements(pass_id);

CREATE TRIGGER set_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE PROCEDURE internal.set_current_timestamp_updated_at();

CREATE TRIGGER enforce_announcement_pass_class
    BEFORE INSERT OR UPDATE ON announcements
    FOR EACH ROW EXECUTE PROCEDURE internal.validate_announcement_pass_class();

/* ----------------------------------------- */

CREATE TABLE announcement_reads (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, announcement_id)
);
COMMENT ON TABLE announcement_reads IS 'Per-user read receipts for announcements. Composite PK ⇒ one receipt per user; no UPDATE policy ⇒ immutable (no immutability trigger needed). Unread = announcements in the user''s classes with no matching row here.';

CREATE INDEX idx_announcement_reads_announcement_id ON announcement_reads(announcement_id);

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
    is_pinned BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_forum_post_video_context CHECK (
        (type = 'general' AND video_id IS NULL) OR
        (type = 'video_qa' AND video_id IS NOT NULL)
    )
);
COMMENT ON TABLE forum_posts IS 'Primary asynchronous discussion nodes establishing the root of a conversation thread.';
COMMENT ON COLUMN forum_posts.is_pinned IS 'Educator/admin sticky flag. Pinned threads float to the top of the forum list across all sorts. Only the class educator or an admin may toggle it (internal.protect_forum_post_ownership guards it against the post author).';
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
    upvotes INTEGER DEFAULT 0 NOT NULL CHECK (upvotes >= 0),
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE forum_replies IS 'Conversational appendages supporting infinite nesting via an adjacency list architecture.';
COMMENT ON COLUMN forum_replies.upvotes IS 'Denormalized endorsement counter fed by the forum_reply_upvotes ledger via internal.maintain_forum_reply_upvote_count. Never written directly by non-admins (internal.protect_forum_reply_upvotes guards it).';
COMMENT ON COLUMN forum_replies.is_deleted IS 'Soft-delete tombstone. A deleted reply that still has children is flagged here (content blanked in the UI as "[deleted]") so the comment tree below it survives; leaf replies are hard-deleted instead.';
COMMENT ON COLUMN forum_replies.post_id IS 'Binds the reply to the root discussion thread. Retained on all nested replies to prevent expensive recursive lookups when fetching a flat thread count.';
COMMENT ON COLUMN forum_replies.parent_reply_id IS 'Self-referencing constraint enabling hierarchical, threaded comment trees. A NULL value indicates a top-level reply directly to the main post.';

CREATE INDEX idx_forum_replies_post_id ON forum_replies(post_id);
CREATE INDEX idx_forum_replies_parent_reply_id ON forum_replies(parent_reply_id);
CREATE INDEX idx_forum_replies_author_id ON forum_replies(author_id);

CREATE TRIGGER set_forum_replies_updated_at
    BEFORE UPDATE ON forum_replies
    FOR EACH ROW EXECUTE PROCEDURE internal.set_forum_reply_updated_at();

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

/* ----------------------------------------- */

CREATE TABLE forum_reply_upvotes (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    reply_id UUID NOT NULL REFERENCES forum_replies(id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, reply_id)
);
COMMENT ON TABLE forum_reply_upvotes IS 'Reply analogue of forum_post_upvotes. One-vote-per-user ledger (composite primary key) feeding the denormalized forum_replies.upvotes counter.';

CREATE INDEX idx_forum_reply_upvotes_reply_id ON forum_reply_upvotes(reply_id);

CREATE TRIGGER maintain_reply_upvote_count_on_insert
    AFTER INSERT ON forum_reply_upvotes
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_forum_reply_upvote_count();

CREATE TRIGGER maintain_reply_upvote_count_on_delete
    AFTER DELETE ON forum_reply_upvotes
    FOR EACH ROW EXECUTE PROCEDURE internal.maintain_forum_reply_upvote_count();

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
CREATE TRIGGER enforce_immutability_educator_reviews BEFORE UPDATE ON educator_reviews FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_video_placements BEFORE UPDATE ON video_placements FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();
CREATE TRIGGER enforce_immutability_resource_placements BEFORE UPDATE ON resource_placements FOR EACH ROW EXECUTE PROCEDURE internal.prevent_immutable_modifications();

CREATE TRIGGER enforce_role_security BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE internal.protect_profile_role();
CREATE TRIGGER enforce_forum_post_security BEFORE UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE internal.protect_forum_post_ownership();
CREATE TRIGGER enforce_forum_reply_security BEFORE UPDATE ON forum_replies FOR EACH ROW EXECUTE PROCEDURE internal.protect_forum_reply_integrity();
CREATE TRIGGER enforce_upvote_count_integrity BEFORE UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE internal.protect_forum_post_upvotes();
CREATE TRIGGER enforce_reply_upvote_count_integrity BEFORE UPDATE ON forum_replies FOR EACH ROW EXECUTE PROCEDURE internal.protect_forum_reply_upvotes();
CREATE TRIGGER enforce_forum_post_video_class BEFORE INSERT OR UPDATE ON forum_posts FOR EACH ROW EXECUTE PROCEDURE internal.validate_forum_post_video_class();
CREATE TRIGGER enforce_placement_class_lineage BEFORE UPDATE ON video_placements FOR EACH ROW EXECUTE PROCEDURE internal.protect_placement_forum_lineage();
CREATE TRIGGER enforce_subtopic_class_lineage BEFORE UPDATE ON subtopics FOR EACH ROW EXECUTE PROCEDURE internal.protect_subtopic_class_lineage();
CREATE TRIGGER enforce_topic_class_lineage BEFORE UPDATE ON topics FOR EACH ROW EXECUTE PROCEDURE internal.protect_topic_class_lineage();
