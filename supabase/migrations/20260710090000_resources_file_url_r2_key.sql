/* Notes bytes moved from Supabase Storage to Cloudflare R2 (plans/r2-notes-migration.md).
   resources.file_url now stores the R2 object KEY ({owner_id}/{uuid}.pdf), not an https URL, so the
   '^https://' protocol CHECK is dropped. The length cap is kept. Both shapes are permitted during the
   dual-read cutover (legacy Supabase https URLs AND new bare R2 keys) — the download route branches on
   the shape. Hand-authored: a data-model change, safe to paste into the Supabase SQL editor. Confirm
   the constraint name first with \d public.resources — a single-column inline CHECK auto-names as
   resources_file_url_check, but verify before DROP. */
ALTER TABLE public.resources DROP CONSTRAINT IF EXISTS resources_file_url_check;
ALTER TABLE public.resources
  ADD CONSTRAINT resources_file_url_check CHECK (char_length(file_url) <= 2048);

COMMENT ON COLUMN public.resources.file_url IS 'The Cloudflare R2 object KEY for the notes PDF, of the form {owner_id}/{uuid}.pdf (an owner-keyed object in the app-gated R2 notes bucket — R2 has no per-user RLS, so the app is the sole gatekeeper). Length-capped at 2048; the protocol CHECK was dropped when the bytes moved off Supabase Storage to R2. Downloads go through /api/resources/[id]/download, which RLS-checks the row then 302s to a short-lived R2 presigned GET — never a direct public read. Legacy rows may still hold a full Supabase Storage https URL during the R2 migration; the download route serves either shape. See plans/r2-notes-migration.md.';
