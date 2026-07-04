/* Universal account avatars for EVERY user (students included).

   Until now avatar_url only existed on educator_profiles (educator-only), so students had nowhere to
   store an avatar and always fell back to initials. This adds a self-serve account avatar:

   1. profiles.avatar_url — the account-wide identity avatar, set in Settings. Self-updatable (NOT locked
      by protect_profile_role); distinct from the educator public-profile masthead photo.
   2. profiles_public now returns COALESCE(profiles.avatar_url, educator_profiles.avatar_url) so the
      Settings avatar wins but an educator who only set a masthead photo still shows it in every chip.
   3. A new PUBLIC owner-keyed `avatars` bucket that ANY authenticated user may write under their own
      {user_id}/ prefix (mirrors rte-images — students upload too, unlike educator-assets).

   Hand-authored (not db diff): storage.* is not db-diff-managed, and db diff re-emits profiles_public
   WITHOUT the GRANT (which would break every cross-user read). Idempotent so it is safe to re-run. */

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS avatar_url TEXT
        CHECK (avatar_url IS NULL OR (char_length(avatar_url) <= 2048 AND avatar_url ~* '^https://'));

COMMENT ON COLUMN public.profiles.avatar_url IS 'The universal account avatar for ANY user (students included), set in Settings and uploaded to the public owner-keyed `avatars` bucket. The identity chip shown app-wide via profiles_public. Distinct from educator_profiles.avatar_url (public sales-page masthead); profiles_public COALESCEs this first. Self-updatable; origin-pinned to the caller''s avatars/{uid}/ prefix by updateAvatarAction.';

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = off) AS
SELECT p.id, p.first_name, p.last_name, p.display_name, p.role, p.is_approved,
       COALESCE(p.avatar_url, ep.avatar_url) AS avatar_url
FROM public.profiles p
LEFT JOIN public.educator_profiles ep ON ep.educator_id = p.id;

GRANT SELECT ON public.profiles_public TO authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_owner_read" on storage.objects;
create policy "avatars_owner_read" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
