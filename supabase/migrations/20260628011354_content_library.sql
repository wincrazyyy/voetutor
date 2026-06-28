-- Greenfield wipe of legacy class-scoped notes so the new owner_id NOT NULL column can be added.
-- (PDFs are re-uploaded through the new owner-owned library; orphaned storage objects are cleared
-- via the dashboard — direct DELETE on storage.objects is blocked by Supabase.)
delete from public.resources;

drop policy "resources_modify_educator_or_admin" on "public"."resources";

drop policy "resources_select_authorized" on "public"."resources";

drop policy "progress_select_authorized" on "public"."user_video_progress";

drop policy "video_placements_modify_educator_or_admin" on "public"."video_placements";

drop policy "video_placements_select_authorized" on "public"."video_placements";

alter table "public"."resources" drop constraint "chk_resource_parent_exclusivity";

alter table "public"."resources" drop constraint "resources_subtopic_id_fkey";

alter table "public"."resources" drop constraint "resources_topic_id_fkey";

alter table "public"."video_placements" drop constraint "video_placements_video_id_subtopic_id_key";

alter table "public"."educator_profiles" drop constraint "educator_profiles_slug_check";

drop view if exists "public"."profiles_public";

drop index if exists "public"."idx_resources_subtopic_id";

drop index if exists "public"."idx_resources_topic_id";

drop index if exists "public"."video_placements_video_id_subtopic_id_key";


  create table "public"."resource_placements" (
    "id" uuid not null default gen_random_uuid(),
    "resource_id" uuid not null,
    "topic_id" uuid,
    "subtopic_id" uuid,
    "order_index" integer not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."resource_placements" enable row level security;

alter table "public"."resources" drop column "subtopic_id";

alter table "public"."resources" drop column "topic_id";

alter table "public"."resources" add column "description" text;

alter table "public"."resources" add column "owner_id" uuid not null;

alter table "public"."video_placements" add column "topic_id" uuid;

alter table "public"."video_placements" alter column "subtopic_id" drop not null;

CREATE INDEX idx_resource_placements_resource_id ON public.resource_placements USING btree (resource_id);

CREATE INDEX idx_resource_placements_subtopic_id ON public.resource_placements USING btree (subtopic_id);

CREATE INDEX idx_resource_placements_topic_id ON public.resource_placements USING btree (topic_id);

CREATE INDEX idx_resources_owner_id ON public.resources USING btree (owner_id);

CREATE INDEX idx_video_placements_topic_id ON public.video_placements USING btree (topic_id);

CREATE UNIQUE INDEX resource_placements_pkey ON public.resource_placements USING btree (id);

CREATE UNIQUE INDEX uniq_resource_placements_subtopic ON public.resource_placements USING btree (resource_id, subtopic_id) WHERE (subtopic_id IS NOT NULL);

CREATE UNIQUE INDEX uniq_resource_placements_topic ON public.resource_placements USING btree (resource_id, topic_id) WHERE (topic_id IS NOT NULL);

CREATE UNIQUE INDEX uniq_video_placements_subtopic ON public.video_placements USING btree (video_id, subtopic_id) WHERE (subtopic_id IS NOT NULL);

CREATE UNIQUE INDEX uniq_video_placements_topic ON public.video_placements USING btree (video_id, topic_id) WHERE (topic_id IS NOT NULL);

alter table "public"."resource_placements" add constraint "resource_placements_pkey" PRIMARY KEY using index "resource_placements_pkey";

alter table "public"."resource_placements" add constraint "chk_resource_placement_parent" CHECK (((topic_id IS NOT NULL) <> (subtopic_id IS NOT NULL))) not valid;

alter table "public"."resource_placements" validate constraint "chk_resource_placement_parent";

alter table "public"."resource_placements" add constraint "resource_placements_order_index_check" CHECK ((order_index >= 0)) not valid;

alter table "public"."resource_placements" validate constraint "resource_placements_order_index_check";

alter table "public"."resource_placements" add constraint "resource_placements_resource_id_fkey" FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."resource_placements" validate constraint "resource_placements_resource_id_fkey";

alter table "public"."resource_placements" add constraint "resource_placements_subtopic_id_fkey" FOREIGN KEY (subtopic_id) REFERENCES public.subtopics(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."resource_placements" validate constraint "resource_placements_subtopic_id_fkey";

alter table "public"."resource_placements" add constraint "resource_placements_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."resource_placements" validate constraint "resource_placements_topic_id_fkey";

alter table "public"."resources" add constraint "resources_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."resources" validate constraint "resources_owner_id_fkey";

alter table "public"."video_placements" add constraint "chk_video_placement_parent" CHECK (((topic_id IS NOT NULL) <> (subtopic_id IS NOT NULL))) not valid;

alter table "public"."video_placements" validate constraint "chk_video_placement_parent";

alter table "public"."video_placements" add constraint "video_placements_topic_id_fkey" FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."video_placements" validate constraint "video_placements_topic_id_fkey";

alter table "public"."educator_profiles" add constraint "educator_profiles_slug_check" CHECK (((slug IS NULL) OR (((char_length(slug) >= 3) AND (char_length(slug) <= 40)) AND (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)))) not valid;

alter table "public"."educator_profiles" validate constraint "educator_profiles_slug_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION internal.owns_resource(p_resource_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.resources
        WHERE id = p_resource_id AND owner_id = (SELECT auth.uid())
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION internal.placement_class_id(p_topic_id uuid, p_subtopic_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION internal.resource_in_user_classes(p_resource_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.resource_placements rp
        WHERE rp.resource_id = p_resource_id
          AND internal.placement_class_id(rp.topic_id, rp.subtopic_id) IN (SELECT internal.get_user_class_ids())
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION internal.protect_educator_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION internal.protect_placement_forum_lineage()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION internal.protect_topic_class_lineage()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION internal.validate_forum_post_video_class()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION internal.video_in_user_classes(p_video_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.video_placements vp
        WHERE vp.video_id = p_video_id
          AND internal.placement_class_id(vp.topic_id, vp.subtopic_id) IN (SELECT internal.get_user_class_ids())
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_educator_profile(p_educator_id uuid)
 RETURNS TABLE(educator_id uuid, first_name text, last_name text, display_name text, avatar_url text, role_label text, headline text, hourly_rate_cents integer, subject_tags text[], profile_doc jsonb, is_verified boolean, tier public.educator_tier, published_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_educator_reviews(p_educator_id uuid)
 RETURNS TABLE(id uuid, rating smallint, comment text, reviewer_first_name text, reviewer_last_name text, reviewer_school text, reviewer_image_url text, source public.review_source, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.list_published_educators(p_limit integer DEFAULT 24, p_subject text DEFAULT NULL::text)
 RETURNS TABLE(educator_id uuid, first_name text, last_name text, display_name text, avatar_url text, role_label text, headline text, hourly_rate_cents integer, subject_tags text[], is_verified boolean, tier public.educator_tier, published_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

create or replace view "public"."profiles_public" as  SELECT id,
    first_name,
    last_name,
    display_name,
    role,
    is_approved
   FROM public.profiles;

-- migra drops/recreates the view WITHOUT its grant; re-add it (see CLAUDE.md gotcha).
grant select on "public"."profiles_public" to "authenticated";


CREATE OR REPLACE FUNCTION public.published_educator_ids(p_ids uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

grant delete on table "public"."resource_placements" to "anon";

grant insert on table "public"."resource_placements" to "anon";

grant references on table "public"."resource_placements" to "anon";

grant select on table "public"."resource_placements" to "anon";

grant trigger on table "public"."resource_placements" to "anon";

grant truncate on table "public"."resource_placements" to "anon";

grant update on table "public"."resource_placements" to "anon";

grant delete on table "public"."resource_placements" to "authenticated";

grant insert on table "public"."resource_placements" to "authenticated";

grant references on table "public"."resource_placements" to "authenticated";

grant select on table "public"."resource_placements" to "authenticated";

grant trigger on table "public"."resource_placements" to "authenticated";

grant truncate on table "public"."resource_placements" to "authenticated";

grant update on table "public"."resource_placements" to "authenticated";

grant delete on table "public"."resource_placements" to "service_role";

grant insert on table "public"."resource_placements" to "service_role";

grant references on table "public"."resource_placements" to "service_role";

grant select on table "public"."resource_placements" to "service_role";

grant trigger on table "public"."resource_placements" to "service_role";

grant truncate on table "public"."resource_placements" to "service_role";

grant update on table "public"."resource_placements" to "service_role";


  create policy "resource_placements_modify_educator_or_admin"
  on "public"."resource_placements"
  as permissive
  for all
  to authenticated
using ((( SELECT internal.is_admin() AS is_admin) OR (( SELECT internal.is_class_educator(internal.placement_class_id(resource_placements.topic_id, resource_placements.subtopic_id)) AS is_class_educator) AND ( SELECT internal.owns_resource(resource_placements.resource_id) AS owns_resource))));



  create policy "resource_placements_select_authorized"
  on "public"."resource_placements"
  as permissive
  for select
  to authenticated
using ((( SELECT internal.is_admin() AS is_admin) OR (( SELECT internal.placement_class_id(resource_placements.topic_id, resource_placements.subtopic_id) AS placement_class_id) IN ( SELECT internal.get_user_class_ids() AS get_user_class_ids))));



  create policy "resources_modify_educator_or_admin"
  on "public"."resources"
  as permissive
  for all
  to authenticated
using ((( SELECT internal.is_admin() AS is_admin) OR (owner_id = ( SELECT auth.uid() AS uid))));



  create policy "resources_select_authorized"
  on "public"."resources"
  as permissive
  for select
  to authenticated
using ((( SELECT internal.is_admin() AS is_admin) OR (owner_id = ( SELECT auth.uid() AS uid)) OR ( SELECT internal.resource_in_user_classes(resources.id) AS resource_in_user_classes)));



  create policy "progress_select_authorized"
  on "public"."user_video_progress"
  as permissive
  for select
  to authenticated
using ((( SELECT internal.is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.video_placements vp
  WHERE ((vp.video_id = user_video_progress.video_id) AND ( SELECT internal.is_class_educator(internal.placement_class_id(vp.topic_id, vp.subtopic_id)) AS is_class_educator))))));



  create policy "video_placements_modify_educator_or_admin"
  on "public"."video_placements"
  as permissive
  for all
  to authenticated
using ((( SELECT internal.is_admin() AS is_admin) OR (( SELECT internal.is_class_educator(internal.placement_class_id(video_placements.topic_id, video_placements.subtopic_id)) AS is_class_educator) AND ( SELECT internal.owns_video(video_placements.video_id) AS owns_video))));



  create policy "video_placements_select_authorized"
  on "public"."video_placements"
  as permissive
  for select
  to authenticated
using ((( SELECT internal.is_admin() AS is_admin) OR (( SELECT internal.placement_class_id(video_placements.topic_id, video_placements.subtopic_id) AS placement_class_id) IN ( SELECT internal.get_user_class_ids() AS get_user_class_ids))));


CREATE TRIGGER enforce_immutability_resource_placements BEFORE UPDATE ON public.resource_placements FOR EACH ROW EXECUTE FUNCTION internal.prevent_immutable_modifications();

-- NOTE: db diff wanted to DROP every storage.objects policy here (class-resources owner-keyed + the
-- educator-assets ones) because storage.* is NOT part of the declarative schema. Those drops were
-- removed by hand — storage policies are owned by their hand-authored migrations
-- (20260628090000_notes_storage_owner_keyed.sql, the educator-assets migrations). Do not re-add them.


