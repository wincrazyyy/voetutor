-- Add an admin branch to the educator-assets READ policy so the admin-side profile builder's orphan
-- cleanup can list() objects under ANY educator's prefix (it already can delete them via the admin
-- branch on educator_assets_owner_delete). Supersedes the owner-only read policy from
-- 20260615090000_educator_assets_storage_policies.sql. storage.* is NOT managed by `supabase db diff`,
-- so this is hand-authored and idempotent (DROP IF EXISTS + CREATE) — safe to re-run / paste into the
-- SQL editor.
--
-- The non-admin branch is unchanged: a regular educator may still only list/read under their OWN
-- {auth.uid()}/ prefix. The admin branch (admins are trusted; only two exist) lets the cleanup helper
-- enumerate a target educator's folder when an admin edits their profile. Public VISIBILITY of
-- published images is unaffected — it comes from the bucket's public flag (object/public served
-- without RLS), not this authenticated SELECT policy.

drop policy if exists "educator_assets_owner_read" on storage.objects;
create policy "educator_assets_owner_read" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'educator-assets'
    and (
      (select internal.is_admin())
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );
