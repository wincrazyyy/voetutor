-- Raise the class-resources (Notes / PDF library) bucket file size limit from 50 MiB to 100 MiB.
-- Hand-authored on purpose: storage.* is NOT managed by `supabase db diff`, so this is never
-- regenerated or clobbered. Idempotent (safe to re-run / paste into the SQL editor); the bucket
-- already exists (20260619090000 / 20260628090000), so a targeted UPDATE is all that's needed.
--
-- IMPORTANT: a bucket file_size_limit is capped by the PROJECT-WIDE storage upload limit. On the
-- hosted project, also raise Dashboard -> Storage -> Settings -> "Upload file size limit" to at
-- least 100 MiB, or uploads above the global limit still fail regardless of this value. (config.toml's
-- [storage] file_size_limit governs the LOCAL stack only, and was bumped to 100MiB alongside this.)

update storage.buckets
  set file_size_limit = 104857600
  where id = 'class-resources';
