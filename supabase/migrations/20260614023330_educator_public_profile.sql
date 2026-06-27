create type "public"."educator_tier" as enum ('basic', 'premium');

drop policy "educator_profiles_insert_self" on "public"."educator_profiles";

drop view if exists "public"."profiles_public";

alter table "public"."educator_profiles" add column "avatar_url" text;

alter table "public"."educator_profiles" add column "headline" text;

alter table "public"."educator_profiles" add column "hourly_rate_cents" integer;

alter table "public"."educator_profiles" add column "is_published" boolean not null default false;

alter table "public"."educator_profiles" add column "is_verified" boolean not null default false;

alter table "public"."educator_profiles" add column "profile_doc" jsonb not null default '{"version": 1, "sections": []}'::jsonb;

alter table "public"."educator_profiles" add column "published_at" timestamp with time zone;

alter table "public"."educator_profiles" add column "role_label" text;

alter table "public"."educator_profiles" add column "slug" text;

alter table "public"."educator_profiles" add column "subject_tags" text[];

alter table "public"."educator_profiles" add column "tier" public.educator_tier not null default 'basic'::public.educator_tier;

alter table "public"."educator_profiles" add column "verified_at" timestamp with time zone;

alter table "public"."educator_profiles" add column "verified_by" uuid;

CREATE UNIQUE INDEX educator_profiles_slug_key ON public.educator_profiles USING btree (slug);

alter table "public"."educator_profiles" add constraint "educator_profiles_avatar_url_check" CHECK (((avatar_url IS NULL) OR ((char_length(avatar_url) <= 2048) AND (avatar_url ~* '^https://'::text)))) not valid;

alter table "public"."educator_profiles" validate constraint "educator_profiles_avatar_url_check";

alter table "public"."educator_profiles" add constraint "educator_profiles_headline_check" CHECK (((headline IS NULL) OR (char_length(headline) <= 160))) not valid;

alter table "public"."educator_profiles" validate constraint "educator_profiles_headline_check";

alter table "public"."educator_profiles" add constraint "educator_profiles_hourly_rate_cents_check" CHECK (((hourly_rate_cents IS NULL) OR (hourly_rate_cents >= 0))) not valid;

alter table "public"."educator_profiles" validate constraint "educator_profiles_hourly_rate_cents_check";

alter table "public"."educator_profiles" add constraint "educator_profiles_profile_doc_check" CHECK ((octet_length((profile_doc)::text) <= 262144)) not valid;

alter table "public"."educator_profiles" validate constraint "educator_profiles_profile_doc_check";

alter table "public"."educator_profiles" add constraint "educator_profiles_role_label_check" CHECK (((role_label IS NULL) OR (char_length(role_label) <= 120))) not valid;

alter table "public"."educator_profiles" validate constraint "educator_profiles_role_label_check";

alter table "public"."educator_profiles" add constraint "educator_profiles_slug_check" CHECK (((slug IS NULL) OR (((char_length(slug) >= 3) AND (char_length(slug) <= 40)) AND (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)))) not valid;

alter table "public"."educator_profiles" validate constraint "educator_profiles_slug_check";

alter table "public"."educator_profiles" add constraint "educator_profiles_slug_key" UNIQUE using index "educator_profiles_slug_key";

alter table "public"."educator_profiles" add constraint "educator_profiles_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."educator_profiles" validate constraint "educator_profiles_verified_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION internal.get_educator_tier(p_educator_id uuid)
 RETURNS public.educator_tier
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_tier public.educator_tier;
BEGIN
    SELECT tier INTO v_tier FROM public.educator_profiles WHERE educator_id = p_educator_id;
    RETURN COALESCE(v_tier, 'basic'::public.educator_tier);
END;
$function$
;

CREATE OR REPLACE FUNCTION internal.maintain_educator_profile_published_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    RETURN NEW;
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
      AND p.role = 'educator'::public.user_role
      AND p.is_approved = TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_educator_tier(p_educator_id uuid, p_tier public.educator_tier)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NOT internal.is_admin() THEN
        RAISE EXCEPTION 'SECURITY VIOLATION: Only admins can set educator tiers.';
    END IF;

    UPDATE public.educator_profiles SET tier = p_tier WHERE educator_id = p_educator_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Educator profile % not found.', p_educator_id;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_educator_verified(p_educator_id uuid, p_verified boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

create or replace view "public"."profiles_public" as  SELECT id,
    first_name,
    last_name,
    display_name,
    role,
    is_approved
   FROM public.profiles;



  create policy "educator_profiles_insert_self"
  on "public"."educator_profiles"
  as permissive
  for insert
  to authenticated
with check (((( SELECT auth.uid() AS uid) = educator_id) AND (( SELECT internal.is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'educator'::public.user_role)))))));


CREATE TRIGGER enforce_educator_admin_fields BEFORE INSERT OR UPDATE ON public.educator_profiles FOR EACH ROW EXECUTE FUNCTION internal.protect_educator_admin_fields();

CREATE TRIGGER set_educator_profile_published_at BEFORE INSERT OR UPDATE ON public.educator_profiles FOR EACH ROW EXECUTE FUNCTION internal.maintain_educator_profile_published_at();

-- ACLs are not emitted by `supabase db diff`; restore them to match supabase/schemas.
-- The diff dropped + recreated profiles_public, losing its grant — re-grant it.
GRANT SELECT ON public.profiles_public TO authenticated;

-- The new RPCs were created with the default PUBLIC execute; apply least-privilege.
REVOKE EXECUTE ON FUNCTION public.get_public_educator_profile(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_educator_profile(uuid) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_educator_verified(uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_educator_verified(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_educator_tier(uuid, public.educator_tier) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_educator_tier(uuid, public.educator_tier) TO authenticated;


