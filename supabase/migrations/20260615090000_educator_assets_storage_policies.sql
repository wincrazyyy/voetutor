-- Educator profile assets: a PUBLIC image bucket + per-educator write RLS.
-- Hand-authored on purpose: storage.* is NOT managed by `supabase db diff`, so this migration is
-- never regenerated or clobbered. It is idempotent (safe to re-run / paste into the SQL editor).
--
-- Write access is keyed by a path convention: every object lives under
-- educator-assets/{educator_id}/...  and the owning educator's auth.uid() must equal that first
-- folder segment. This is what makes the renderer's per-educator origin-pin meaningful — an educator
-- can only write under their own prefix. Public read because these are public sales-page assets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('educator-assets', 'educator-assets', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Read via the authenticated API / list() is restricted to the owning educator. Public VISIBILITY of
-- images is provided by the bucket's public flag: the /storage/v1/object/public/... URL endpoint
-- serves objects WITHOUT consulting RLS, so a published sales-page image still loads for anonymous
-- visitors who have its URL. Removing the broad public SELECT blocks anonymous / cross-user list()
-- enumeration of the bucket (educator IDs + draft images) while keeping public pages rendering.
drop policy if exists "educator_assets_public_read" on storage.objects;
drop policy if exists "educator_assets_owner_read" on storage.objects;
create policy "educator_assets_owner_read" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'educator-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "educator_assets_owner_insert" on storage.objects;
create policy "educator_assets_owner_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'educator-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and ((select internal.is_admin()) or (select internal.is_active_educator()))
  );

drop policy if exists "educator_assets_owner_update" on storage.objects;
create policy "educator_assets_owner_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'educator-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and ((select internal.is_admin()) or (select internal.is_active_educator()))
  )
  with check (
    bucket_id = 'educator-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and ((select internal.is_admin()) or (select internal.is_active_educator()))
  );

drop policy if exists "educator_assets_owner_delete" on storage.objects;
create policy "educator_assets_owner_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'educator-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and ((select internal.is_admin()) or (select internal.is_active_educator()))
  );
