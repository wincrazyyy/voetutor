


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."announcement_type" AS ENUM (
    'standard',
    'important',
    'event'
);


ALTER TYPE "public"."announcement_type" OWNER TO "postgres";


CREATE TYPE "public"."forum_post_type" AS ENUM (
    'general',
    'video_qa'
);


ALTER TYPE "public"."forum_post_type" OWNER TO "postgres";


CREATE TYPE "public"."topic_status" AS ENUM (
    'locked',
    'active',
    'completed'
);


ALTER TYPE "public"."topic_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'student',
    'educator',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_educator"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."approve_educator"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_class_ids"() RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
        SELECT class_id FROM public.class_enrollments WHERE user_id = auth.uid()
        UNION
        SELECT id FROM public.classes WHERE educator_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."get_user_class_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "public"."user_role"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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

    -- Unapproved educators have no educator-level authority yet; fold them
    -- back to student so every existing RLS policy keeps working unchanged.
    IF v_role = 'educator'::public.user_role AND v_is_approved = FALSE THEN
        RETURN 'student'::public.user_role;
    END IF;

    RETURN v_role;
END;
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_class_educator"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = p_class_id AND educator_id = auth.uid()
    );
END;
$$;


ALTER FUNCTION "public"."is_class_educator"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintain_forum_post_upvote_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."maintain_forum_post_upvote_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_immutable_modifications"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."prevent_immutable_modifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_forum_post_ownership"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."protect_forum_post_ownership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_forum_post_upvotes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.upvotes IS DISTINCT FROM OLD.upvotes AND public.get_user_role() != 'admin' THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Direct manipulation of upvote counts is prohibited. Insert into forum_post_upvotes instead.';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_forum_post_upvotes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_role"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."protect_profile_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_subtopic_class_lineage"() RETURNS "trigger"
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."protect_subtopic_class_lineage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_topic_class_lineage"() RETURNS "trigger"
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."protect_topic_class_lineage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_video_class_lineage"() RETURNS "trigger"
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."protect_video_class_lineage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_timestamp_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_current_timestamp_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_forum_post_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_forum_post_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_forum_post_video_class"() RETURNS "trigger"
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_forum_post_video_class"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "content" "text" NOT NULL,
    "type" "public"."announcement_type" DEFAULT 'standard'::"public"."announcement_type" NOT NULL,
    "link_title" character varying(255),
    "link_url" character varying(2048),
    "image_alt" character varying(255),
    "image_url" character varying(2048),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_announcements_image_url_format" CHECK ((("image_url" IS NULL) OR (("image_url")::"text" ~* '^https://'::"text"))),
    CONSTRAINT "chk_announcements_link_url_format" CHECK ((("link_url" IS NULL) OR (("link_url")::"text" ~* '^https://'::"text")))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_enrollments" (
    "user_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."class_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" character varying(50) NOT NULL,
    "title" character varying(255) NOT NULL,
    "educator_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."educator_profiles" (
    "educator_id" "uuid" NOT NULL,
    "gender" character varying(50),
    "whatsapp_number" character varying(50),
    "education" "text",
    "education_degree" character varying(255),
    "education_major" character varying(255),
    "graduation_year" integer,
    "teaching_experience" "text",
    "teaching_subjects" "text",
    "self_introduction" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "educator_profiles_graduation_year_check" CHECK ((("graduation_year" IS NULL) OR (("graduation_year" >= 1900) AND ("graduation_year" <= 2100))))
);

ALTER TABLE ONLY "public"."educator_profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."educator_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."educator_profiles" IS 'Optional 1:1 sidecar to profiles holding application / promotion fields that only educators care about. Filled in after sign-up by the educator themselves; admins read it during approval review and may also surface it on public educator profiles for promotion.';



COMMENT ON COLUMN "public"."educator_profiles"."self_introduction" IS 'Free-form pitch the educator writes about themselves. Surfaced to admins for review and may be displayed publicly for promotion — front-end UI warns the educator to keep it serious.';



CREATE TABLE IF NOT EXISTS "public"."forum_post_upvotes" (
    "user_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forum_post_upvotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "type" "public"."forum_post_type" DEFAULT 'general'::"public"."forum_post_type" NOT NULL,
    "video_id" "uuid",
    "title" character varying(255) NOT NULL,
    "content" "text" NOT NULL,
    "upvotes" integer DEFAULT 0 NOT NULL,
    "is_resolved" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_forum_post_video_context" CHECK (((("type" = 'general'::"public"."forum_post_type") AND ("video_id" IS NULL)) OR (("type" = 'video_qa'::"public"."forum_post_type") AND ("video_id" IS NOT NULL)))),
    CONSTRAINT "forum_posts_upvotes_check" CHECK (("upvotes" >= 0))
);


ALTER TABLE "public"."forum_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "parent_reply_id" "uuid",
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forum_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "first_name" character varying(100),
    "last_name" character varying(100),
    "display_name" character varying(100),
    "role" "public"."user_role" DEFAULT 'student'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "is_approved" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."profiles_public" AS
 SELECT "id",
    "first_name",
    "last_name",
    "display_name",
    "role",
    "is_approved"
   FROM "public"."profiles";


ALTER VIEW "public"."profiles_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "size_bytes" bigint NOT NULL,
    "file_url" character varying(2048) NOT NULL,
    "topic_id" "uuid",
    "subtopic_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_resource_parent_exclusivity" CHECK (((("topic_id" IS NOT NULL) AND ("subtopic_id" IS NULL)) OR (("topic_id" IS NULL) AND ("subtopic_id" IS NOT NULL)))),
    CONSTRAINT "chk_resources_url_format" CHECK ((("file_url")::"text" ~* '^https://'::"text")),
    CONSTRAINT "resources_size_bytes_check" CHECK (("size_bytes" >= 0))
);


ALTER TABLE "public"."resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subtopics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subtopics_order_index_check" CHECK (("order_index" >= 0))
);


ALTER TABLE "public"."subtopics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "total_duration" interval,
    "status" "public"."topic_status" DEFAULT 'locked'::"public"."topic_status" NOT NULL,
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "topics_order_index_check" CHECK (("order_index" >= 0))
);


ALTER TABLE "public"."topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_video_progress" (
    "user_id" "uuid" NOT NULL,
    "video_id" "uuid" NOT NULL,
    "last_position" interval DEFAULT '00:00:00'::interval NOT NULL,
    "total_watch_time" interval DEFAULT '00:00:00'::interval NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_video_progress_last_position_check" CHECK (("last_position" >= '00:00:00'::interval)),
    CONSTRAINT "user_video_progress_total_watch_time_check" CHECK (("total_watch_time" >= '00:00:00'::interval))
);


ALTER TABLE "public"."user_video_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subtopic_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "duration" interval,
    "video_url" character varying(2048),
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_videos_url_format" CHECK ((("video_url" IS NULL) OR (("video_url")::"text" ~* '^https://'::"text"))),
    CONSTRAINT "videos_order_index_check" CHECK (("order_index" >= 0))
);


ALTER TABLE "public"."videos" OWNER TO "postgres";


ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("user_id", "class_id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."educator_profiles"
    ADD CONSTRAINT "educator_profiles_pkey" PRIMARY KEY ("educator_id");



ALTER TABLE ONLY "public"."forum_post_upvotes"
    ADD CONSTRAINT "forum_post_upvotes_pkey" PRIMARY KEY ("user_id", "post_id");



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_replies"
    ADD CONSTRAINT "forum_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subtopics"
    ADD CONSTRAINT "subtopics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_video_progress"
    ADD CONSTRAINT "user_video_progress_pkey" PRIMARY KEY ("user_id", "video_id");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_announcements_author_id" ON "public"."announcements" USING "btree" ("author_id");



CREATE INDEX "idx_announcements_class_id" ON "public"."announcements" USING "btree" ("class_id");



CREATE INDEX "idx_class_enrollments_class_id" ON "public"."class_enrollments" USING "btree" ("class_id");



CREATE INDEX "idx_classes_educator_id" ON "public"."classes" USING "btree" ("educator_id");



CREATE INDEX "idx_forum_post_upvotes_post_id" ON "public"."forum_post_upvotes" USING "btree" ("post_id");



CREATE INDEX "idx_forum_posts_author_id" ON "public"."forum_posts" USING "btree" ("author_id");



CREATE INDEX "idx_forum_posts_class_id" ON "public"."forum_posts" USING "btree" ("class_id");



CREATE INDEX "idx_forum_posts_video_id" ON "public"."forum_posts" USING "btree" ("video_id");



CREATE INDEX "idx_forum_replies_author_id" ON "public"."forum_replies" USING "btree" ("author_id");



CREATE INDEX "idx_forum_replies_parent_reply_id" ON "public"."forum_replies" USING "btree" ("parent_reply_id");



CREATE INDEX "idx_forum_replies_post_id" ON "public"."forum_replies" USING "btree" ("post_id");



CREATE INDEX "idx_resources_subtopic_id" ON "public"."resources" USING "btree" ("subtopic_id");



CREATE INDEX "idx_resources_topic_id" ON "public"."resources" USING "btree" ("topic_id");



CREATE INDEX "idx_subtopics_topic_id" ON "public"."subtopics" USING "btree" ("topic_id");



CREATE INDEX "idx_topics_class_id" ON "public"."topics" USING "btree" ("class_id");



CREATE INDEX "idx_user_video_progress_video_id" ON "public"."user_video_progress" USING "btree" ("video_id");



CREATE INDEX "idx_videos_subtopic_id" ON "public"."videos" USING "btree" ("subtopic_id");



CREATE OR REPLACE TRIGGER "enforce_forum_post_security" BEFORE UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "public"."protect_forum_post_ownership"();



CREATE OR REPLACE TRIGGER "enforce_forum_post_video_class" BEFORE INSERT OR UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "public"."validate_forum_post_video_class"();



CREATE OR REPLACE TRIGGER "enforce_immutability_announcements" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_classes" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_forum_posts" BEFORE UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_forum_replies" BEFORE UPDATE ON "public"."forum_replies" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_resources" BEFORE UPDATE ON "public"."resources" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_subtopics" BEFORE UPDATE ON "public"."subtopics" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_topics" BEFORE UPDATE ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_videos" BEFORE UPDATE ON "public"."videos" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_role_security" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_role"();



CREATE OR REPLACE TRIGGER "enforce_subtopic_class_lineage" BEFORE UPDATE ON "public"."subtopics" FOR EACH ROW EXECUTE FUNCTION "public"."protect_subtopic_class_lineage"();



CREATE OR REPLACE TRIGGER "enforce_topic_class_lineage" BEFORE UPDATE ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "public"."protect_topic_class_lineage"();



CREATE OR REPLACE TRIGGER "enforce_upvote_count_integrity" BEFORE UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "public"."protect_forum_post_upvotes"();



CREATE OR REPLACE TRIGGER "enforce_video_class_lineage" BEFORE UPDATE ON "public"."videos" FOR EACH ROW EXECUTE FUNCTION "public"."protect_video_class_lineage"();



CREATE OR REPLACE TRIGGER "maintain_upvote_count_on_delete" AFTER DELETE ON "public"."forum_post_upvotes" FOR EACH ROW EXECUTE FUNCTION "public"."maintain_forum_post_upvote_count"();



CREATE OR REPLACE TRIGGER "maintain_upvote_count_on_insert" AFTER INSERT ON "public"."forum_post_upvotes" FOR EACH ROW EXECUTE FUNCTION "public"."maintain_forum_post_upvote_count"();



CREATE OR REPLACE TRIGGER "set_announcements_updated_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_classes_updated_at" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_educator_profiles_updated_at" BEFORE UPDATE ON "public"."educator_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_forum_posts_updated_at" BEFORE UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "public"."set_forum_post_updated_at"();



CREATE OR REPLACE TRIGGER "set_forum_replies_updated_at" BEFORE UPDATE ON "public"."forum_replies" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_resources_updated_at" BEFORE UPDATE ON "public"."resources" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_subtopics_updated_at" BEFORE UPDATE ON "public"."subtopics" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_topics_updated_at" BEFORE UPDATE ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_video_progress_updated_at" BEFORE UPDATE ON "public"."user_video_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_videos_updated_at" BEFORE UPDATE ON "public"."videos" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_educator_id_fkey" FOREIGN KEY ("educator_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."educator_profiles"
    ADD CONSTRAINT "educator_profiles_educator_id_fkey" FOREIGN KEY ("educator_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_post_upvotes"
    ADD CONSTRAINT "forum_post_upvotes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_post_upvotes"
    ADD CONSTRAINT "forum_post_upvotes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_replies"
    ADD CONSTRAINT "forum_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_replies"
    ADD CONSTRAINT "forum_replies_parent_reply_id_fkey" FOREIGN KEY ("parent_reply_id") REFERENCES "public"."forum_replies"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_replies"
    ADD CONSTRAINT "forum_replies_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subtopics"
    ADD CONSTRAINT "subtopics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_video_progress"
    ADD CONSTRAINT "user_video_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_video_progress"
    ADD CONSTRAINT "user_video_progress_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON UPDATE CASCADE ON DELETE CASCADE;



CREATE POLICY "Announcements_Delete_Author" ON "public"."announcements" FOR DELETE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("author_id" = "auth"."uid"())));



CREATE POLICY "Announcements_Insert_Author" ON "public"."announcements" FOR INSERT WITH CHECK ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR (("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "announcements"."class_id") AND ("classes"."educator_id" = "auth"."uid"())))))));



CREATE POLICY "Announcements_Select_Authorized" ON "public"."announcements" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids"))));



CREATE POLICY "Announcements_Update_Author" ON "public"."announcements" FOR UPDATE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("author_id" = "auth"."uid"())));



CREATE POLICY "Classes_Delete_Admin" ON "public"."classes" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "Classes_Insert_Admin" ON "public"."classes" FOR INSERT WITH CHECK (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "Classes_Select_Authorized" ON "public"."classes" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids"))));



CREATE POLICY "Classes_Update_EducatorOrAdmin" ON "public"."classes" FOR UPDATE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("educator_id" = "auth"."uid"())));



CREATE POLICY "EducatorProfiles_Delete_SelfOrAdmin" ON "public"."educator_profiles" FOR DELETE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("auth"."uid"() = "educator_id")));



COMMENT ON POLICY "EducatorProfiles_Delete_SelfOrAdmin" ON "public"."educator_profiles" IS 'Educator can wipe their extended info; admin can clean it up if needed.';



CREATE POLICY "EducatorProfiles_Insert_Self" ON "public"."educator_profiles" FOR INSERT WITH CHECK ((("auth"."uid"() = "educator_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'educator'::"public"."user_role"))))));



COMMENT ON POLICY "EducatorProfiles_Insert_Self" ON "public"."educator_profiles" IS 'Only the owning educator can create their row, and only if their literal profile role is educator (covers both pending and approved educators; students cannot insert).';



CREATE POLICY "EducatorProfiles_Select_SelfOrAdmin" ON "public"."educator_profiles" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("auth"."uid"() = "educator_id")));



COMMENT ON POLICY "EducatorProfiles_Select_SelfOrAdmin" ON "public"."educator_profiles" IS 'The educator owns their row; admins can read every row to support approval review. Public promotion surfaces (future feature) will read through a SECURITY DEFINER function or a dedicated view rather than this policy.';



CREATE POLICY "EducatorProfiles_Update_Self" ON "public"."educator_profiles" FOR UPDATE USING (("auth"."uid"() = "educator_id")) WITH CHECK (("auth"."uid"() = "educator_id"));



COMMENT ON POLICY "EducatorProfiles_Update_Self" ON "public"."educator_profiles" IS 'Educators may keep updating their own application info indefinitely. WITH CHECK matches USING so the row cannot be redirected onto another educator mid-update.';



CREATE POLICY "Enrollments_Delete_Authorized" ON "public"."class_enrollments" FOR DELETE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("user_id" = "auth"."uid"()) OR "public"."is_class_educator"("class_id")));



CREATE POLICY "Enrollments_Insert_EducatorOrAdmin" ON "public"."class_enrollments" FOR INSERT WITH CHECK ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR "public"."is_class_educator"("class_id")));



CREATE POLICY "Enrollments_Select_Authorized" ON "public"."class_enrollments" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("user_id" = "auth"."uid"()) OR "public"."is_class_educator"("class_id")));



CREATE POLICY "ForumPostUpvotes_Delete_Self" ON "public"."forum_post_upvotes" FOR DELETE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("user_id" = "auth"."uid"())));



CREATE POLICY "ForumPostUpvotes_Insert_Self" ON "public"."forum_post_upvotes" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."forum_posts" "fp"
  WHERE (("fp"."id" = "forum_post_upvotes"."post_id") AND ("fp"."class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids")))))));



CREATE POLICY "ForumPostUpvotes_Select_Authorized" ON "public"."forum_post_upvotes" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM "public"."forum_posts" "fp"
  WHERE (("fp"."id" = "forum_post_upvotes"."post_id") AND ("fp"."class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids")))))));



CREATE POLICY "ForumPosts_Delete_Authorized" ON "public"."forum_posts" FOR DELETE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "forum_posts"."class_id") AND ("classes"."educator_id" = "auth"."uid"()))))));



CREATE POLICY "ForumPosts_Insert_Authorized" ON "public"."forum_posts" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids")))));



CREATE POLICY "ForumPosts_Select_Authorized" ON "public"."forum_posts" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids"))));



CREATE POLICY "ForumPosts_Update_Authorized" ON "public"."forum_posts" FOR UPDATE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "forum_posts"."class_id") AND ("classes"."educator_id" = "auth"."uid"()))))));



CREATE POLICY "ForumReplies_Delete_Authorized" ON "public"."forum_replies" FOR DELETE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."forum_posts" "fp"
     JOIN "public"."classes" "c" ON (("c"."id" = "fp"."class_id")))
  WHERE (("fp"."id" = "forum_replies"."post_id") AND ("c"."educator_id" = "auth"."uid"()))))));



CREATE POLICY "ForumReplies_Insert_Authorized" ON "public"."forum_replies" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (("public"."get_user_role"() = 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM "public"."forum_posts" "fp"
  WHERE (("fp"."id" = "forum_replies"."post_id") AND ("fp"."class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids"))))))));



CREATE POLICY "ForumReplies_Select_Authorized" ON "public"."forum_replies" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM "public"."forum_posts" "fp"
  WHERE (("fp"."id" = "forum_replies"."post_id") AND ("fp"."class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids")))))));



CREATE POLICY "ForumReplies_Update_Author" ON "public"."forum_replies" FOR UPDATE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("author_id" = "auth"."uid"())));



CREATE POLICY "Profiles_Select_SelfOrAdmin" ON "public"."profiles" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("auth"."uid"() = "id")));



CREATE POLICY "Profiles_Update_SelfOrAdmin" ON "public"."profiles" FOR UPDATE USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("auth"."uid"() = "id"))) WITH CHECK ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("auth"."uid"() = "id")));



CREATE POLICY "Progress_Insert_Self" ON "public"."user_video_progress" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Progress_Select_Authorized" ON "public"."user_video_progress" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ((("public"."videos" "v"
     JOIN "public"."subtopics" "s" ON (("s"."id" = "v"."subtopic_id")))
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
     JOIN "public"."classes" "c" ON (("c"."id" = "t"."class_id")))
  WHERE (("v"."id" = "user_video_progress"."video_id") AND ("c"."educator_id" = "auth"."uid"()))))));



CREATE POLICY "Progress_Update_Self" ON "public"."user_video_progress" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Resources_Modify_EducatorOrAdmin" ON "public"."resources" USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM ("public"."topics" "t"
     JOIN "public"."classes" "c" ON (("c"."id" = "t"."class_id")))
  WHERE (("t"."id" = "resources"."topic_id") AND ("c"."educator_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM (("public"."subtopics" "s"
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
     JOIN "public"."classes" "c" ON (("c"."id" = "t"."class_id")))
  WHERE (("s"."id" = "resources"."subtopic_id") AND ("c"."educator_id" = "auth"."uid"()))))));



CREATE POLICY "Resources_Select_Authorized" ON "public"."resources" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM "public"."topics" "t"
  WHERE (("t"."id" = "resources"."topic_id") AND ("t"."class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."subtopics" "s"
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
  WHERE (("s"."id" = "resources"."subtopic_id") AND ("t"."class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids")))))));



CREATE POLICY "Subtopics_Modify_EducatorOrAdmin" ON "public"."subtopics" USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM ("public"."topics" "t"
     JOIN "public"."classes" "c" ON (("c"."id" = "t"."class_id")))
  WHERE (("t"."id" = "subtopics"."topic_id") AND ("c"."educator_id" = "auth"."uid"()))))));



CREATE POLICY "Subtopics_Select_Authorized" ON "public"."subtopics" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM "public"."topics" "t"
  WHERE (("t"."id" = "subtopics"."topic_id") AND ("t"."class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids")))))));



CREATE POLICY "Topics_Modify_EducatorOrAdmin" ON "public"."topics" USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "topics"."class_id") AND ("classes"."educator_id" = "auth"."uid"()))))));



CREATE POLICY "Topics_Select_Authorized" ON "public"."topics" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR ("class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids"))));



CREATE POLICY "Videos_Modify_EducatorOrAdmin" ON "public"."videos" USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM (("public"."subtopics" "s"
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
     JOIN "public"."classes" "c" ON (("c"."id" = "t"."class_id")))
  WHERE (("s"."id" = "videos"."subtopic_id") AND ("c"."educator_id" = "auth"."uid"()))))));



CREATE POLICY "Videos_Select_Authorized" ON "public"."videos" FOR SELECT USING ((("public"."get_user_role"() = 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM ("public"."subtopics" "s"
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
  WHERE (("s"."id" = "videos"."subtopic_id") AND ("t"."class_id" IN ( SELECT "public"."get_user_class_ids"() AS "get_user_class_ids")))))));



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."educator_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_post_upvotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subtopics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_video_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."videos" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."approve_educator"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_educator"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_educator"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_class_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_class_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_class_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_class_educator"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_class_educator"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_class_educator"("p_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."maintain_forum_post_upvote_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."maintain_forum_post_upvote_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."maintain_forum_post_upvote_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_immutable_modifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_immutable_modifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_immutable_modifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_forum_post_ownership"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_forum_post_ownership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_forum_post_ownership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_forum_post_upvotes"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_forum_post_upvotes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_forum_post_upvotes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_profile_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_profile_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_profile_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_subtopic_class_lineage"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_subtopic_class_lineage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_subtopic_class_lineage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_topic_class_lineage"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_topic_class_lineage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_topic_class_lineage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_video_class_lineage"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_video_class_lineage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_video_class_lineage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_forum_post_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_forum_post_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_forum_post_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_forum_post_video_class"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_forum_post_video_class"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_forum_post_video_class"() TO "service_role";


















GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."class_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."class_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."class_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."educator_profiles" TO "anon";
GRANT ALL ON TABLE "public"."educator_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."educator_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."forum_post_upvotes" TO "anon";
GRANT ALL ON TABLE "public"."forum_post_upvotes" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_post_upvotes" TO "service_role";



GRANT ALL ON TABLE "public"."forum_posts" TO "anon";
GRANT ALL ON TABLE "public"."forum_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_posts" TO "service_role";



GRANT ALL ON TABLE "public"."forum_replies" TO "anon";
GRANT ALL ON TABLE "public"."forum_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_replies" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles_public" TO "anon";
GRANT ALL ON TABLE "public"."profiles_public" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles_public" TO "service_role";



GRANT ALL ON TABLE "public"."resources" TO "anon";
GRANT ALL ON TABLE "public"."resources" TO "authenticated";
GRANT ALL ON TABLE "public"."resources" TO "service_role";



GRANT ALL ON TABLE "public"."subtopics" TO "anon";
GRANT ALL ON TABLE "public"."subtopics" TO "authenticated";
GRANT ALL ON TABLE "public"."subtopics" TO "service_role";



GRANT ALL ON TABLE "public"."topics" TO "anon";
GRANT ALL ON TABLE "public"."topics" TO "authenticated";
GRANT ALL ON TABLE "public"."topics" TO "service_role";



GRANT ALL ON TABLE "public"."user_video_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_video_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_video_progress" TO "service_role";



GRANT ALL ON TABLE "public"."videos" TO "anon";
GRANT ALL ON TABLE "public"."videos" TO "authenticated";
GRANT ALL ON TABLE "public"."videos" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



