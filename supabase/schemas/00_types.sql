/* ==========  00_types.sql  ==========
   Enums consumed across the schema. Created first so subsequent
   tables, functions, and policies can reference them without
   forward-declaration concerns. */

/* ==========  ENUMERATED TYPES  ========== */

CREATE TYPE user_role AS ENUM ('student', 'educator', 'admin');
CREATE TYPE announcement_type AS ENUM ('standard', 'important', 'event');
CREATE TYPE topic_status AS ENUM ('locked', 'active', 'completed');
CREATE TYPE forum_post_type AS ENUM ('general', 'video_qa');
CREATE TYPE class_report_status AS ENUM ('pending', 'dismissed', 'actioned');
CREATE TYPE video_status AS ENUM ('uploading', 'queued', 'processing', 'ready', 'errored');
CREATE TYPE educator_tier AS ENUM ('basic', 'premium');
CREATE TYPE review_source AS ENUM ('imported', 'verified');
CREATE TYPE enrollment_access AS ENUM ('full', 'scoped');
