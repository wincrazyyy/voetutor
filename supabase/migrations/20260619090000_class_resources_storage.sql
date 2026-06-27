-- Class curriculum resources: a PRIVATE PDF bucket gated by class membership.
-- Hand-authored on purpose: storage.* is NOT managed by `supabase db diff`, so this migration is
-- never regenerated or clobbered. It is idempotent (safe to re-run / paste into the SQL editor).
--
-- Path convention: every object lives under class-resources/{class_id}/{uuid}.pdf. Write access is the
-- class educator (owner of {class_id}); read access mirrors resources_select_authorized -- any caller
-- enrolled in or teaching the class (plus admins). The bucket is PRIVATE: downloads go through a
-- short-lived signed URL minted server-side, so a leaked object URL is useless and non-enrolled users
-- never reach the bytes. This matches the enrolment-gated RLS intent of the public.resources table,
-- unlike the deliberately public educator-assets bucket (public sales-page images).
--
-- The first path segment is compared as TEXT (never cast to uuid). All SELECT policies on
-- storage.objects are OR-combined across every bucket, so a `(foldername(name))[1]::uuid` cast here
-- would be evaluated against objects in OTHER buckets too and would error on any non-uuid prefix
-- (the educator-assets policies dodge this the same way). Text comparison is total and never throws.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-resources', 'class-resources', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- READ: admins, plus any caller enrolled in or teaching the class named by the first path segment.
-- Mirrors resources_select_authorized so an object follows the same visibility boundary as its row.
drop policy if exists "class_resources_member_read" on storage.objects;
create policy "class_resources_member_read" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'class-resources'
    and (
      (select internal.is_admin())
      or (storage.foldername(name))[1] in (
        select cid::text from internal.get_user_class_ids() as cid
      )
    )
  );

-- WRITE (insert/update/delete): admins, plus the educator who owns the class named by the path prefix.
drop policy if exists "class_resources_owner_insert" on storage.objects;
create policy "class_resources_owner_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'class-resources'
    and (
      (select internal.is_admin())
      or exists (
        select 1 from public.classes c
        where c.id::text = (storage.foldername(name))[1]
          and c.educator_id = (select auth.uid())
      )
    )
  );

drop policy if exists "class_resources_owner_update" on storage.objects;
create policy "class_resources_owner_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'class-resources'
    and (
      (select internal.is_admin())
      or exists (
        select 1 from public.classes c
        where c.id::text = (storage.foldername(name))[1]
          and c.educator_id = (select auth.uid())
      )
    )
  )
  with check (
    bucket_id = 'class-resources'
    and (
      (select internal.is_admin())
      or exists (
        select 1 from public.classes c
        where c.id::text = (storage.foldername(name))[1]
          and c.educator_id = (select auth.uid())
      )
    )
  );

drop policy if exists "class_resources_owner_delete" on storage.objects;
create policy "class_resources_owner_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'class-resources'
    and (
      (select internal.is_admin())
      or exists (
        select 1 from public.classes c
        where c.id::text = (storage.foldername(name))[1]
          and c.educator_id = (select auth.uid())
      )
    )
  );
