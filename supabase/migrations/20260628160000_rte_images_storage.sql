-- RTE image embeds: a PUBLIC image bucket for photos embedded in forum posts/replies (and, later,
-- announcements). Hand-authored on purpose: storage.* is NOT managed by `supabase db diff`. Idempotent.
--
-- Unlike educator-assets (educator-write-only), the forum is authored by students too, so ANY
-- authenticated user may write under their own prefix: rte-images/{user_id}/...  Write access is keyed
-- by that first folder segment matching auth.uid(), which is what makes the renderer's origin-pin
-- (lib/forum/rte-image.ts isRteImageUrl) meaningful. Public read so embedded images render for every
-- class member via the /object/public/ URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rte-images', 'rte-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "rte_images_owner_read" on storage.objects;
create policy "rte_images_owner_read" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'rte-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "rte_images_owner_insert" on storage.objects;
create policy "rte_images_owner_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'rte-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "rte_images_owner_update" on storage.objects;
create policy "rte_images_owner_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'rte-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'rte-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "rte_images_owner_delete" on storage.objects;
create policy "rte_images_owner_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'rte-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
