-- Notes (PDF) library storage: switch the class-resources bucket from class-keyed to OWNER-keyed.
-- Hand-authored on purpose: storage.* is NOT managed by `supabase db diff`, so this migration is never
-- regenerated or clobbered. It is idempotent (safe to re-run / paste into the SQL editor).
--
-- Library model: a note (public.resources row) is owned by an educator and surfaced into the
-- curriculum via public.resource_placements (topic OR subtopic, across any of the owner's classes).
-- The object therefore lives under the OWNER, not a single class: class-resources/{owner_id}/{uuid}.pdf.
--
-- WRITE access: the owner of the {owner_id} prefix (or an admin).
-- READ access: the owner or an admin ONLY. Students never read storage directly anymore -- they go
-- through /api/resources/[id]/download, which RLS-checks the resources row (resources_select_authorized
-- covers "placed in a class I'm in") and then mints a short-lived signed URL with the service-role
-- client. A path prefix can't encode "every class this shared note is placed in", so the API route is
-- the single read boundary -- mirroring how Cloudflare video playback tokens are minted server-side.
--
-- The first path segment is compared as TEXT (never cast to uuid). All SELECT policies on
-- storage.objects are OR-combined across every bucket, so a `(foldername(name))[1]::uuid` cast here
-- would be evaluated against objects in OTHER buckets too and would error on any non-uuid prefix.
--
-- GREENFIELD cut-over: any old class-keyed objects ({class_id}/...) become dead bytes — their resources
-- rows are dropped when the resources table is rebuilt, and the new owner-keyed RLS never matches a
-- class-id prefix, so no one but an admin can read them. We do NOT delete them here: direct DELETE on
-- storage.objects is blocked by Supabase ("use the Storage API"). Empty the class-resources bucket via
-- the dashboard (or the Storage API) to reclaim the bytes; there were no/few real PDFs (recent feature)
-- and educators re-upload through the new library.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-resources', 'class-resources', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Drop the previous class-keyed policies.
drop policy if exists "class_resources_member_read" on storage.objects;
drop policy if exists "class_resources_owner_insert" on storage.objects;
drop policy if exists "class_resources_owner_update" on storage.objects;
drop policy if exists "class_resources_owner_delete" on storage.objects;
-- Drop owner-keyed policies too so this migration is fully idempotent on re-run.
drop policy if exists "class_resources_owner_read" on storage.objects;
drop policy if exists "class_resources_owner_keyed_insert" on storage.objects;
drop policy if exists "class_resources_owner_keyed_update" on storage.objects;
drop policy if exists "class_resources_owner_keyed_delete" on storage.objects;

-- READ: owner of the {owner_id} prefix, or admin. Students reach bytes via the download API route.
create policy "class_resources_owner_read" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'class-resources'
    and (
      (select internal.is_admin())
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

-- WRITE (insert/update/delete): owner of the {owner_id} prefix, or admin.
create policy "class_resources_owner_keyed_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'class-resources'
    and (
      (select internal.is_admin())
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy "class_resources_owner_keyed_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'class-resources'
    and (
      (select internal.is_admin())
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  )
  with check (
    bucket_id = 'class-resources'
    and (
      (select internal.is_admin())
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy "class_resources_owner_keyed_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'class-resources'
    and (
      (select internal.is_admin())
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );
