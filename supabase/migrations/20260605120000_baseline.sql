


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


CREATE SCHEMA IF NOT EXISTS "internal";


ALTER SCHEMA "internal" OWNER TO "postgres";


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


CREATE TYPE "public"."class_report_status" AS ENUM (
    'pending',
    'dismissed',
    'actioned'
);


ALTER TYPE "public"."class_report_status" OWNER TO "postgres";


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


CREATE TYPE "public"."video_status" AS ENUM (
    'uploading',
    'queued',
    'processing',
    'ready',
    'errored'
);


ALTER TYPE "public"."video_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."get_user_class_ids"() RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN QUERY
        SELECT class_id FROM public.class_enrollments WHERE user_id = (SELECT auth.uid())
        UNION
        SELECT id FROM public.classes WHERE educator_id = (SELECT auth.uid());
END;
$$;


ALTER FUNCTION "internal"."get_user_class_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."get_user_role"() RETURNS "public"."user_role"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "internal"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "internal"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."is_active_educator"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
          AND role = 'educator'::public.user_role
          AND is_approved = TRUE
    );
END;
$$;


ALTER FUNCTION "internal"."is_active_educator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = 'admin'::public.user_role
    );
END;
$$;


ALTER FUNCTION "internal"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."is_class_educator"("p_class_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = p_class_id AND educator_id = (SELECT auth.uid())
    );
END;
$$;


ALTER FUNCTION "internal"."is_class_educator"("p_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."maintain_class_published_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "internal"."maintain_class_published_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."maintain_forum_post_upvote_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "internal"."maintain_forum_post_upvote_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."prevent_educator_profile_modifications"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.educator_id IS DISTINCT FROM OLD.educator_id THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: educator_id (PK) modifications are strictly prohibited.';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: created_at timestamp modifications are strictly prohibited.';
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "internal"."prevent_educator_profile_modifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."prevent_immutable_modifications"() RETURNS "trigger"
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


ALTER FUNCTION "internal"."prevent_immutable_modifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."protect_forum_post_ownership"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "internal"."protect_forum_post_ownership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."protect_forum_post_upvotes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.upvotes IS DISTINCT FROM OLD.upvotes AND NOT internal.is_admin() THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Direct manipulation of upvote counts is prohibited. Insert into forum_post_upvotes instead.';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "internal"."protect_forum_post_upvotes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."protect_placement_forum_lineage"() RETURNS "trigger"
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
       AND EXISTS (
           SELECT 1 FROM public.forum_posts
           WHERE video_id = NEW.video_id AND class_id = v_old_class_id
       ) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: Cannot move this placement to a different class while forum_posts in the original class reference the video. Move or delete the dependent video_qa posts first.';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "internal"."protect_placement_forum_lineage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."protect_profile_role"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "internal"."protect_profile_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."protect_subtopic_class_lineage"() RETURNS "trigger"
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
           JOIN public.video_placements vp ON vp.video_id = fp.video_id
           WHERE vp.subtopic_id = NEW.id
       ) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: Cannot reparent subtopic % to a topic in a different class while forum_posts reference videos placed within it. Move or delete the dependent video_qa posts first.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "internal"."protect_subtopic_class_lineage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."protect_topic_class_lineage"() RETURNS "trigger"
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    IF NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.forum_posts fp
        JOIN public.video_placements vp ON vp.video_id = fp.video_id
        JOIN public.subtopics s ON s.id = vp.subtopic_id
        WHERE s.topic_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: Cannot move topic % to a different class while forum_posts reference videos placed within its subtree. Move or delete the dependent video_qa posts first.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "internal"."protect_topic_class_lineage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."set_current_timestamp_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "internal"."set_current_timestamp_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."set_forum_post_updated_at"() RETURNS "trigger"
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


ALTER FUNCTION "internal"."set_forum_post_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "internal"."validate_forum_post_video_class"() RETURNS "trigger"
    LANGUAGE "plpgsql" STABLE
    AS $$
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
        JOIN public.subtopics s ON s.id = vp.subtopic_id
        JOIN public.topics t ON t.id = s.topic_id
        WHERE vp.video_id = NEW.video_id AND t.class_id = NEW.class_id
    ) THEN
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: forum_posts.video_id must reference a video placed in the same class as the post (post class %).', NEW.class_id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "internal"."validate_forum_post_video_class"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_educator"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."approve_educator"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enroll_in_free_class"("p_class_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."enroll_in_free_class"("p_class_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "type" "public"."announcement_type" DEFAULT 'standard'::"public"."announcement_type" NOT NULL,
    "link_title" "text",
    "link_url" "text",
    "image_alt" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "announcements_image_alt_check" CHECK ((("image_alt" IS NULL) OR ("char_length"("image_alt") <= 255))),
    CONSTRAINT "announcements_image_url_check" CHECK ((("image_url" IS NULL) OR (("char_length"("image_url") <= 2048) AND ("image_url" ~* '^https://'::"text")))),
    CONSTRAINT "announcements_link_title_check" CHECK ((("link_title" IS NULL) OR ("char_length"("link_title") <= 255))),
    CONSTRAINT "announcements_link_url_check" CHECK ((("link_url" IS NULL) OR (("char_length"("link_url") <= 2048) AND ("link_url" ~* '^https://'::"text")))),
    CONSTRAINT "announcements_title_check" CHECK (("char_length"("title") <= 255))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_enrollments" (
    "user_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "enrolled_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."class_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "public"."class_report_status" DEFAULT 'pending'::"public"."class_report_status" NOT NULL,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "class_reports_reason_check" CHECK ((("char_length"(TRIM(BOTH FROM "reason")) > 0) AND ("char_length"("reason") <= 1000)))
);

ALTER TABLE ONLY "public"."class_reports" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(4), 'hex'::"text") NOT NULL,
    "title" "text" NOT NULL,
    "educator_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" DEFAULT 'hkd'::"text" NOT NULL,
    "description" "text",
    "is_published" boolean DEFAULT false NOT NULL,
    "price_cents" integer DEFAULT 0 NOT NULL,
    "published_at" timestamp with time zone,
    CONSTRAINT "classes_code_check" CHECK (("char_length"("code") <= 50)),
    CONSTRAINT "classes_currency_check" CHECK (("currency" = 'hkd'::"text")),
    CONSTRAINT "classes_price_cents_check" CHECK (("price_cents" >= 0)),
    CONSTRAINT "classes_title_check" CHECK (("char_length"("title") <= 255))
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."educator_profiles" (
    "educator_id" "uuid" NOT NULL,
    "gender" "text",
    "whatsapp_number" "text",
    "education" "text",
    "education_degree" "text",
    "education_major" "text",
    "graduation_year" integer,
    "teaching_experience" "text",
    "teaching_subjects" "text",
    "self_introduction" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "educator_profiles_education_degree_check" CHECK ((("education_degree" IS NULL) OR ("char_length"("education_degree") <= 255))),
    CONSTRAINT "educator_profiles_education_major_check" CHECK ((("education_major" IS NULL) OR ("char_length"("education_major") <= 255))),
    CONSTRAINT "educator_profiles_gender_check" CHECK ((("gender" IS NULL) OR ("char_length"("gender") <= 50))),
    CONSTRAINT "educator_profiles_graduation_year_check" CHECK ((("graduation_year" IS NULL) OR (("graduation_year" >= 1900) AND ("graduation_year" <= 2100)))),
    CONSTRAINT "educator_profiles_whatsapp_number_check" CHECK ((("whatsapp_number" IS NULL) OR ("char_length"("whatsapp_number") <= 50)))
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
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "upvotes" integer DEFAULT 0 NOT NULL,
    "is_resolved" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_forum_post_video_context" CHECK (((("type" = 'general'::"public"."forum_post_type") AND ("video_id" IS NULL)) OR (("type" = 'video_qa'::"public"."forum_post_type") AND ("video_id" IS NOT NULL)))),
    CONSTRAINT "forum_posts_title_check" CHECK (("char_length"("title") <= 255)),
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
    "first_name" "text",
    "last_name" "text",
    "display_name" "text",
    "role" "public"."user_role" DEFAULT 'student'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "is_approved" boolean DEFAULT true NOT NULL,
    CONSTRAINT "profiles_display_name_check" CHECK ((("display_name" IS NULL) OR ("char_length"("display_name") <= 100))),
    CONSTRAINT "profiles_first_name_check" CHECK ((("first_name" IS NULL) OR ("char_length"("first_name") <= 100))),
    CONSTRAINT "profiles_last_name_check" CHECK ((("last_name" IS NULL) OR ("char_length"("last_name") <= 100)))
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
    "title" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "file_url" "text" NOT NULL,
    "topic_id" "uuid",
    "subtopic_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_resource_parent_exclusivity" CHECK (((("topic_id" IS NOT NULL) AND ("subtopic_id" IS NULL)) OR (("topic_id" IS NULL) AND ("subtopic_id" IS NOT NULL)))),
    CONSTRAINT "resources_file_url_check" CHECK ((("char_length"("file_url") <= 2048) AND ("file_url" ~* '^https://'::"text"))),
    CONSTRAINT "resources_size_bytes_check" CHECK (("size_bytes" >= 0)),
    CONSTRAINT "resources_title_check" CHECK (("char_length"("title") <= 255))
);


ALTER TABLE "public"."resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subtopics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subtopics_order_index_check" CHECK (("order_index" >= 0)),
    CONSTRAINT "subtopics_title_check" CHECK (("char_length"("title") <= 255))
);


ALTER TABLE "public"."subtopics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "total_duration" interval,
    "status" "public"."topic_status" DEFAULT 'locked'::"public"."topic_status" NOT NULL,
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "topics_order_index_check" CHECK (("order_index" >= 0)),
    CONSTRAINT "topics_title_check" CHECK (("char_length"("title") <= 255))
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


CREATE TABLE IF NOT EXISTS "public"."video_placements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "video_id" "uuid" NOT NULL,
    "subtopic_id" "uuid" NOT NULL,
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "video_placements_order_index_check" CHECK (("order_index" >= 0))
);

ALTER TABLE ONLY "public"."video_placements" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_placements" OWNER TO "postgres";


COMMENT ON TABLE "public"."video_placements" IS 'Join table placing library videos into the curriculum: each row surfaces one video inside one subtopic at a given order_index. The many-to-many design lets a single video appear in multiple subtopics across the owning educator''s classes (overlap). Deleting a subtopic removes the placement only — the underlying library video survives; deleting a video removes all its placements.';



COMMENT ON COLUMN "public"."video_placements"."order_index" IS 'Position of the video within its subtopic. Not unique; the curriculum sorts by it and the educator reorders via drag-and-drop. The (video_id, subtopic_id) UNIQUE constraint blocks placing the same video into one subtopic twice.';



CREATE TABLE IF NOT EXISTS "public"."videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "duration" interval,
    "video_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cloudflare_uid" "text",
    "status" "public"."video_status" DEFAULT 'uploading'::"public"."video_status" NOT NULL,
    "thumbnail_url" "text",
    "owner_id" "uuid" NOT NULL,
    CONSTRAINT "videos_cloudflare_uid_check" CHECK ((("cloudflare_uid" IS NULL) OR ("char_length"("cloudflare_uid") <= 64))),
    CONSTRAINT "videos_thumbnail_url_check" CHECK ((("thumbnail_url" IS NULL) OR (("char_length"("thumbnail_url") <= 2048) AND ("thumbnail_url" ~* '^https://'::"text")))),
    CONSTRAINT "videos_title_check" CHECK (("char_length"("title") <= 255)),
    CONSTRAINT "videos_video_url_check" CHECK ((("video_url" IS NULL) OR (("char_length"("video_url") <= 2048) AND ("video_url" ~* '^https://'::"text"))))
);


ALTER TABLE "public"."videos" OWNER TO "postgres";


COMMENT ON TABLE "public"."videos" IS 'Educator-owned library of instructional media. A video exists independently of the curriculum and is surfaced inside classes through video_placements (many-to-many), so one video can appear in several subtopics across several of the owning educator''s classes.';



COMMENT ON COLUMN "public"."videos"."cloudflare_uid" IS 'Cloudflare Stream video identifier. UNIQUE so the Stream webhook can resolve a videos row from an incoming notification; NULL only for legacy or externally-hosted rows that never went through the direct-upload flow.';



COMMENT ON COLUMN "public"."videos"."status" IS 'Encoding lifecycle for Cloudflare Stream videos: uploading (row created, bytes in flight), then queued/processing (Cloudflare encoding), then ready (playable) or errored. The webhook is the source of truth after upload; only a ready video mints a playback token.';



COMMENT ON COLUMN "public"."videos"."thumbnail_url" IS 'Cloudflare-generated poster image, cached on the row so curriculum cards render without an extra Stream API call. Inline CHECK enforces the 2048-char cap and HTTPS-only transport.';



COMMENT ON COLUMN "public"."videos"."owner_id" IS 'The educator who owns this library video. Edit/delete and placement rights resolve directly from this column rather than through the curriculum hierarchy, since a video may be placed into many classes or none.';



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("user_id", "class_id");



ALTER TABLE ONLY "public"."class_reports"
    ADD CONSTRAINT "class_reports_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."video_placements"
    ADD CONSTRAINT "video_placements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_placements"
    ADD CONSTRAINT "video_placements_video_id_subtopic_id_key" UNIQUE ("video_id", "subtopic_id");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_cloudflare_uid_key" UNIQUE ("cloudflare_uid");



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_announcements_author_id" ON "public"."announcements" USING "btree" ("author_id");



CREATE INDEX "idx_announcements_class_id" ON "public"."announcements" USING "btree" ("class_id");



CREATE INDEX "idx_class_enrollments_class_id" ON "public"."class_enrollments" USING "btree" ("class_id");



CREATE INDEX "idx_class_reports_class_id" ON "public"."class_reports" USING "btree" ("class_id");



CREATE INDEX "idx_class_reports_pending" ON "public"."class_reports" USING "btree" ("created_at" DESC) WHERE ("status" = 'pending'::"public"."class_report_status");



CREATE INDEX "idx_class_reports_reporter_id" ON "public"."class_reports" USING "btree" ("reporter_id");



CREATE INDEX "idx_class_reports_resolved_by" ON "public"."class_reports" USING "btree" ("resolved_by");



CREATE INDEX "idx_classes_educator_id" ON "public"."classes" USING "btree" ("educator_id");



CREATE INDEX "idx_classes_marketplace" ON "public"."classes" USING "btree" ("published_at" DESC) WHERE ("is_published" = true);



CREATE INDEX "idx_forum_post_upvotes_post_id" ON "public"."forum_post_upvotes" USING "btree" ("post_id");



CREATE INDEX "idx_forum_posts_author_id" ON "public"."forum_posts" USING "btree" ("author_id");



CREATE INDEX "idx_forum_posts_class_id" ON "public"."forum_posts" USING "btree" ("class_id");



CREATE INDEX "idx_forum_posts_video_id" ON "public"."forum_posts" USING "btree" ("video_id");



CREATE INDEX "idx_forum_replies_author_id" ON "public"."forum_replies" USING "btree" ("author_id");



CREATE INDEX "idx_forum_replies_parent_reply_id" ON "public"."forum_replies" USING "btree" ("parent_reply_id");



CREATE INDEX "idx_forum_replies_post_id" ON "public"."forum_replies" USING "btree" ("post_id");



CREATE INDEX "idx_profiles_approved_by" ON "public"."profiles" USING "btree" ("approved_by");



CREATE INDEX "idx_profiles_educator_approved" ON "public"."profiles" USING "btree" ("approved_at" DESC) WHERE (("role" = 'educator'::"public"."user_role") AND ("is_approved" = true));



CREATE INDEX "idx_profiles_educator_pending" ON "public"."profiles" USING "btree" ("created_at") WHERE (("role" = 'educator'::"public"."user_role") AND ("is_approved" = false));



CREATE INDEX "idx_resources_subtopic_id" ON "public"."resources" USING "btree" ("subtopic_id");



CREATE INDEX "idx_resources_topic_id" ON "public"."resources" USING "btree" ("topic_id");



CREATE INDEX "idx_subtopics_topic_id" ON "public"."subtopics" USING "btree" ("topic_id");



CREATE INDEX "idx_topics_class_id" ON "public"."topics" USING "btree" ("class_id");



CREATE INDEX "idx_user_video_progress_video_id" ON "public"."user_video_progress" USING "btree" ("video_id");



CREATE INDEX "idx_video_placements_subtopic_id" ON "public"."video_placements" USING "btree" ("subtopic_id");



CREATE INDEX "idx_video_placements_video_id" ON "public"."video_placements" USING "btree" ("video_id");



CREATE INDEX "idx_videos_owner_id" ON "public"."videos" USING "btree" ("owner_id");



CREATE UNIQUE INDEX "uniq_class_reports_pending_per_user" ON "public"."class_reports" USING "btree" ("class_id", "reporter_id") WHERE ("status" = 'pending'::"public"."class_report_status");



CREATE OR REPLACE TRIGGER "enforce_forum_post_security" BEFORE UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "internal"."protect_forum_post_ownership"();



CREATE OR REPLACE TRIGGER "enforce_forum_post_video_class" BEFORE INSERT OR UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "internal"."validate_forum_post_video_class"();



CREATE OR REPLACE TRIGGER "enforce_immutability_announcements" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_class_reports" BEFORE UPDATE ON "public"."class_reports" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_classes" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_educator_profiles" BEFORE UPDATE ON "public"."educator_profiles" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_educator_profile_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_forum_posts" BEFORE UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_forum_replies" BEFORE UPDATE ON "public"."forum_replies" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_resources" BEFORE UPDATE ON "public"."resources" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_subtopics" BEFORE UPDATE ON "public"."subtopics" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_topics" BEFORE UPDATE ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_video_placements" BEFORE UPDATE ON "public"."video_placements" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_immutability_videos" BEFORE UPDATE ON "public"."videos" FOR EACH ROW EXECUTE FUNCTION "internal"."prevent_immutable_modifications"();



CREATE OR REPLACE TRIGGER "enforce_placement_class_lineage" BEFORE UPDATE ON "public"."video_placements" FOR EACH ROW EXECUTE FUNCTION "internal"."protect_placement_forum_lineage"();



CREATE OR REPLACE TRIGGER "enforce_role_security" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "internal"."protect_profile_role"();



CREATE OR REPLACE TRIGGER "enforce_subtopic_class_lineage" BEFORE UPDATE ON "public"."subtopics" FOR EACH ROW EXECUTE FUNCTION "internal"."protect_subtopic_class_lineage"();



CREATE OR REPLACE TRIGGER "enforce_topic_class_lineage" BEFORE UPDATE ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "internal"."protect_topic_class_lineage"();



CREATE OR REPLACE TRIGGER "enforce_upvote_count_integrity" BEFORE UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "internal"."protect_forum_post_upvotes"();



CREATE OR REPLACE TRIGGER "maintain_upvote_count_on_delete" AFTER DELETE ON "public"."forum_post_upvotes" FOR EACH ROW EXECUTE FUNCTION "internal"."maintain_forum_post_upvote_count"();



CREATE OR REPLACE TRIGGER "maintain_upvote_count_on_insert" AFTER INSERT ON "public"."forum_post_upvotes" FOR EACH ROW EXECUTE FUNCTION "internal"."maintain_forum_post_upvote_count"();



CREATE OR REPLACE TRIGGER "set_announcements_updated_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_class_reports_updated_at" BEFORE UPDATE ON "public"."class_reports" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_classes_published_at" BEFORE INSERT OR UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "internal"."maintain_class_published_at"();



CREATE OR REPLACE TRIGGER "set_classes_updated_at" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_educator_profiles_updated_at" BEFORE UPDATE ON "public"."educator_profiles" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_forum_posts_updated_at" BEFORE UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "internal"."set_forum_post_updated_at"();



CREATE OR REPLACE TRIGGER "set_forum_replies_updated_at" BEFORE UPDATE ON "public"."forum_replies" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_resources_updated_at" BEFORE UPDATE ON "public"."resources" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_subtopics_updated_at" BEFORE UPDATE ON "public"."subtopics" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_topics_updated_at" BEFORE UPDATE ON "public"."topics" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_video_progress_updated_at" BEFORE UPDATE ON "public"."user_video_progress" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "set_videos_updated_at" BEFORE UPDATE ON "public"."videos" FOR EACH ROW EXECUTE FUNCTION "internal"."set_current_timestamp_updated_at"();



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_reports"
    ADD CONSTRAINT "class_reports_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_reports"
    ADD CONSTRAINT "class_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_reports"
    ADD CONSTRAINT "class_reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE SET NULL;



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



ALTER TABLE ONLY "public"."video_placements"
    ADD CONSTRAINT "video_placements_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_placements"
    ADD CONSTRAINT "video_placements_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."videos"
    ADD CONSTRAINT "videos_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "announcements_delete_author" ON "public"."announcements" FOR DELETE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("author_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "announcements_insert_author" ON "public"."announcements" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "internal"."is_admin"() AS "is_admin") OR (("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "announcements"."class_id") AND ("classes"."educator_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "announcements_select_authorized" ON "public"."announcements" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids"))));



CREATE POLICY "announcements_update_author" ON "public"."announcements" FOR UPDATE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("author_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."class_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_reports_delete_admin" ON "public"."class_reports" FOR DELETE TO "authenticated" USING (( SELECT "internal"."is_admin"() AS "is_admin"));



CREATE POLICY "class_reports_insert_authenticated_reporter" ON "public"."class_reports" FOR INSERT TO "authenticated" WITH CHECK ((("reporter_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"public"."class_report_status") AND ("resolved_by" IS NULL) AND ("resolved_at" IS NULL)));



CREATE POLICY "class_reports_select_own_or_admin" ON "public"."class_reports" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("reporter_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "class_reports_update_admin" ON "public"."class_reports" FOR UPDATE TO "authenticated" USING (( SELECT "internal"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "internal"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classes_delete_educator_or_admin" ON "public"."classes" FOR DELETE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("educator_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "classes_insert_educator_or_admin" ON "public"."classes" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "internal"."is_admin"() AS "is_admin") OR (("educator_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "internal"."is_active_educator"() AS "is_active_educator"))));



CREATE POLICY "classes_select_authorized" ON "public"."classes" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("educator_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("is_published" = true) OR ("id" IN ( SELECT "class_enrollments"."class_id"
   FROM "public"."class_enrollments"
  WHERE ("class_enrollments"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "classes_update_educator_or_admin" ON "public"."classes" FOR UPDATE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("educator_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("educator_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."educator_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "educator_profiles_delete_self_or_admin" ON "public"."educator_profiles" FOR DELETE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "educator_id")));



CREATE POLICY "educator_profiles_insert_self" ON "public"."educator_profiles" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "educator_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'educator'::"public"."user_role"))))));



CREATE POLICY "educator_profiles_select_self_or_admin" ON "public"."educator_profiles" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "educator_id")));



CREATE POLICY "educator_profiles_update_self" ON "public"."educator_profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "educator_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "educator_id"));



CREATE POLICY "enrollments_delete_authorized" ON "public"."class_enrollments" FOR DELETE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "internal"."is_class_educator"("class_enrollments"."class_id") AS "is_class_educator")));



CREATE POLICY "enrollments_insert_educator_or_admin" ON "public"."class_enrollments" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "internal"."is_admin"() AS "is_admin") OR ( SELECT "internal"."is_class_educator"("class_enrollments"."class_id") AS "is_class_educator")));



CREATE POLICY "enrollments_select_authorized" ON "public"."class_enrollments" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "internal"."is_class_educator"("class_enrollments"."class_id") AS "is_class_educator")));



ALTER TABLE "public"."forum_post_upvotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forum_post_upvotes_delete_self" ON "public"."forum_post_upvotes" FOR DELETE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "forum_post_upvotes_insert_self" ON "public"."forum_post_upvotes" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."forum_posts" "fp"
  WHERE (("fp"."id" = "forum_post_upvotes"."post_id") AND ("fp"."class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids")))))));



CREATE POLICY "forum_post_upvotes_select_authorized" ON "public"."forum_post_upvotes" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."forum_posts" "fp"
  WHERE (("fp"."id" = "forum_post_upvotes"."post_id") AND ("fp"."class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids")))))));



ALTER TABLE "public"."forum_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forum_posts_delete_authorized" ON "public"."forum_posts" FOR DELETE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("author_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "forum_posts"."class_id") AND ("classes"."educator_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "forum_posts_insert_authorized" ON "public"."forum_posts" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND (( SELECT "internal"."is_admin"() AS "is_admin") OR ("class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids")))));



CREATE POLICY "forum_posts_select_authorized" ON "public"."forum_posts" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids"))));



CREATE POLICY "forum_posts_update_authorized" ON "public"."forum_posts" FOR UPDATE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("author_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "forum_posts"."class_id") AND ("classes"."educator_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."forum_replies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "forum_replies_delete_authorized" ON "public"."forum_replies" FOR DELETE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("author_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM ("public"."forum_posts" "fp"
     JOIN "public"."classes" "c" ON (("c"."id" = "fp"."class_id")))
  WHERE (("fp"."id" = "forum_replies"."post_id") AND ("c"."educator_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "forum_replies_insert_authorized" ON "public"."forum_replies" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND (( SELECT "internal"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."forum_posts" "fp"
  WHERE (("fp"."id" = "forum_replies"."post_id") AND ("fp"."class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids"))))))));



CREATE POLICY "forum_replies_select_authorized" ON "public"."forum_replies" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."forum_posts" "fp"
  WHERE (("fp"."id" = "forum_replies"."post_id") AND ("fp"."class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids")))))));



CREATE POLICY "forum_replies_update_author" ON "public"."forum_replies" FOR UPDATE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("author_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_self_or_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "id")));



CREATE POLICY "profiles_update_self_or_admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "id"))) WITH CHECK ((( SELECT "internal"."is_admin"() AS "is_admin") OR (( SELECT "auth"."uid"() AS "uid") = "id")));



CREATE POLICY "progress_insert_self" ON "public"."user_video_progress" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "progress_select_authorized" ON "public"."user_video_progress" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM ((("public"."video_placements" "vp"
     JOIN "public"."subtopics" "s" ON (("s"."id" = "vp"."subtopic_id")))
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
     JOIN "public"."classes" "c" ON (("c"."id" = "t"."class_id")))
  WHERE (("vp"."video_id" = "user_video_progress"."video_id") AND ("c"."educator_id" = ( SELECT "auth"."uid"() AS "uid")))))));



COMMENT ON POLICY "progress_select_authorized" ON "public"."user_video_progress" IS 'Permits students to fetch their own telemetry state, while granting educators visibility over progress for any video placed in a class they own (resolved via video_placements).';



CREATE POLICY "progress_update_self" ON "public"."user_video_progress" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "resources_modify_educator_or_admin" ON "public"."resources" TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM ("public"."topics" "t"
     JOIN "public"."classes" "c" ON (("c"."id" = "t"."class_id")))
  WHERE (("t"."id" = "resources"."topic_id") AND ("c"."educator_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM (("public"."subtopics" "s"
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
     JOIN "public"."classes" "c" ON (("c"."id" = "t"."class_id")))
  WHERE (("s"."id" = "resources"."subtopic_id") AND ("c"."educator_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "resources_select_authorized" ON "public"."resources" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."topics" "t"
  WHERE (("t"."id" = "resources"."topic_id") AND ("t"."class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."subtopics" "s"
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
  WHERE (("s"."id" = "resources"."subtopic_id") AND ("t"."class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids")))))));



ALTER TABLE "public"."subtopics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subtopics_modify_educator_or_admin" ON "public"."subtopics" TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM ("public"."topics" "t"
     JOIN "public"."classes" "c" ON (("c"."id" = "t"."class_id")))
  WHERE (("t"."id" = "subtopics"."topic_id") AND ("c"."educator_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "subtopics_select_authorized" ON "public"."subtopics" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."topics" "t"
  WHERE (("t"."id" = "subtopics"."topic_id") AND ("t"."class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids")))))));



ALTER TABLE "public"."topics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "topics_modify_educator_or_admin" ON "public"."topics" TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "topics"."class_id") AND ("classes"."educator_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "topics_select_authorized" ON "public"."topics" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids"))));



ALTER TABLE "public"."user_video_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_placements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "video_placements_modify_educator_or_admin" ON "public"."video_placements" TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ((EXISTS ( SELECT 1
   FROM (("public"."subtopics" "s"
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
     JOIN "public"."classes" "c" ON (("c"."id" = "t"."class_id")))
  WHERE (("s"."id" = "video_placements"."subtopic_id") AND ("c"."educator_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND (EXISTS ( SELECT 1
   FROM "public"."videos" "v"
  WHERE (("v"."id" = "video_placements"."video_id") AND ("v"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



COMMENT ON POLICY "video_placements_modify_educator_or_admin" ON "public"."video_placements" IS 'Placing/reordering/removing a video requires the caller to BOTH own the destination class (educator) AND own the video — enforcing the same-educator-only sharing rule. FOR ALL with no separate WITH CHECK means USING is applied to both the old and new row, so a cross-class move must satisfy ownership on both endpoints.';



CREATE POLICY "video_placements_select_authorized" ON "public"."video_placements" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM ("public"."subtopics" "s"
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
  WHERE (("s"."id" = "video_placements"."subtopic_id") AND ("t"."class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids")))))));



COMMENT ON POLICY "video_placements_select_authorized" ON "public"."video_placements" IS 'A placement is visible to anyone who can see its subtopic — i.e. users enrolled in or teaching the placement''s class. Drives curriculum rendering for students and educators.';



ALTER TABLE "public"."videos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "videos_modify_educator_or_admin" ON "public"."videos" TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid"))));



COMMENT ON POLICY "videos_modify_educator_or_admin" ON "public"."videos" IS 'Library videos are managed (Insert/Update/Delete) by their owning educator or an admin. Ownership resolves directly from owner_id. FOR ALL with USING only (matching the curriculum-modify convention): Postgres applies USING to both the existing and the new row, so an INSERT must set owner_id to the caller and an UPDATE cannot reassign ownership.';



CREATE POLICY "videos_select_authorized" ON "public"."videos" FOR SELECT TO "authenticated" USING ((( SELECT "internal"."is_admin"() AS "is_admin") OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM (("public"."video_placements" "vp"
     JOIN "public"."subtopics" "s" ON (("s"."id" = "vp"."subtopic_id")))
     JOIN "public"."topics" "t" ON (("t"."id" = "s"."topic_id")))
  WHERE (("vp"."video_id" = "videos"."id") AND ("t"."class_id" IN ( SELECT "internal"."get_user_class_ids"() AS "get_user_class_ids")))))));



COMMENT ON POLICY "videos_select_authorized" ON "public"."videos" IS 'Library videos are visible to admins, the owning educator, and any user enrolled in (or teaching) a class the video is placed into via video_placements.';





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "internal" TO "authenticated";
GRANT USAGE ON SCHEMA "internal" TO "anon";
GRANT USAGE ON SCHEMA "internal" TO "service_role";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































REVOKE ALL ON FUNCTION "public"."approve_educator"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_educator"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_educator"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_educator"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enroll_in_free_class"("p_class_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enroll_in_free_class"("p_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."enroll_in_free_class"("p_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enroll_in_free_class"("p_class_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."class_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."class_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."class_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."class_reports" TO "anon";
GRANT ALL ON TABLE "public"."class_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."class_reports" TO "service_role";



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



GRANT ALL ON TABLE "public"."video_placements" TO "anon";
GRANT ALL ON TABLE "public"."video_placements" TO "authenticated";
GRANT ALL ON TABLE "public"."video_placements" TO "service_role";



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

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "internal"."handle_new_user"();



