/* Let admins write educator-assets storage objects under ANY educator's prefix, so the admin-side
   profile builder can upload an avatar / photo on the educator's behalf. Supersedes the write policies
   from 20260615090000_educator_assets_storage_policies.sql by rewriting insert / update / delete with
   an admin-OR branch. storage.* is NOT managed by `supabase db diff`, so this is hand-authored and
   idempotent (DROP IF EXISTS + CREATE) — safe to re-run / paste into the SQL editor.

   The non-admin branch is unchanged: a regular educator may still only write under their OWN
   {auth.uid()}/ prefix and only while an active educator. The admin branch drops the folder constraint
   (admins are trusted; only two exist) but stays scoped to the educator-assets bucket. The renderer's
   per-educator origin-pin (lib/profile/asset-url.ts) is unaffected: an admin upload still lands under
   the TARGET educator's {id}/ prefix (uploadEducatorImage builds the path from the target id), so the
   persisted URL still passes isOwnEducatorAssetUrl for that educator's public page.

   The owner-only READ policy (educator_assets_owner_read) is intentionally left untouched — public
   visibility of published images comes from the bucket's public flag (object/public served without
   RLS), and admins read images via that public URL like everyone else. */

drop policy if exists "educator_assets_owner_insert" on storage.objects;
create policy "educator_assets_owner_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'educator-assets'
    and (
      (select internal.is_admin())
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (select internal.is_active_educator())
      )
    )
  );

drop policy if exists "educator_assets_owner_update" on storage.objects;
create policy "educator_assets_owner_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'educator-assets'
    and (
      (select internal.is_admin())
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (select internal.is_active_educator())
      )
    )
  )
  with check (
    bucket_id = 'educator-assets'
    and (
      (select internal.is_admin())
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (select internal.is_active_educator())
      )
    )
  );

drop policy if exists "educator_assets_owner_delete" on storage.objects;
create policy "educator_assets_owner_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'educator-assets'
    and (
      (select internal.is_admin())
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (select internal.is_active_educator())
      )
    )
  );
