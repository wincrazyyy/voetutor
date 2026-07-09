import "server-only";

/**
 * Storage identity/parse helpers for the notes (PDF) library. The BYTES live in Cloudflare R2 under
 * an owner-keyed object `{owner_id}/{uuid}.pdf`; the S3 calls that read/write/delete them live in
 * lib/storage/r2.ts. This module only builds and parses the value stored in `resources.file_url`.
 *
 * The bucket is app-gated (R2 has no per-user RLS) — /api/resources/[id]/download is the read
 * boundary: it RLS-checks the caller's access to the `resources` row, THEN 302s to a short-lived R2
 * presigned GET. See plans/r2-notes-migration.md.
 *
 * Dual-read: rows created before the R2 migration still hold a full Supabase Storage https URL. The
 * helpers below recognise both shapes so the download/delete paths keep working mid-migration; the
 * one-off scripts/migrate-notes-to-r2.ts copies those bytes to R2 and rewrites file_url to a bare key.
 */

/** The legacy Supabase Storage bucket the notes bytes lived in before R2 (dual-read + reap only). */
export const LEGACY_NOTES_BUCKET = "class-resources";

/** Marker inside a legacy Supabase Storage public/object URL, ahead of the owner-keyed object path. */
const LEGACY_MARKER = `/storage/v1/object/${LEGACY_NOTES_BUCKET}/`;

/** Build the value stored in resources.file_url — the bare R2 object key `{ownerId}/{uuid}.pdf`. */
export function noteFileUrl(ownerId: string, uuid: string): string {
  return `${ownerId}/${uuid}.pdf`;
}

/**
 * Recover the object KEY from a stored file_url. Handles BOTH the new bare R2 key and a legacy
 * Supabase https URL (the same `{owner_id}/{uuid}.pdf` key lives after the marker), so the download
 * and reap paths work throughout the migration. Returns null if it isn't a well-formed owner-keyed
 * `.pdf` (rejects path traversal).
 */
export function noteKeyFromFileUrl(fileUrl: string): string | null {
  let key = fileUrl;
  const markerIndex = fileUrl.indexOf(LEGACY_MARKER);
  if (markerIndex !== -1) {
    key = decodeURIComponent(fileUrl.slice(markerIndex + LEGACY_MARKER.length));
  }
  if (!key || key.includes("..") || !key.toLowerCase().endsWith(".pdf")) return null;
  return key;
}

/** True when a stored file_url still points at legacy Supabase Storage (routes dual-read/reap). */
export function isLegacySupabaseNote(fileUrl: string): boolean {
  return fileUrl.includes(LEGACY_MARKER);
}

/** True when a key is a well-formed owner-keyed note object owned by `ownerId` (rejects traversal). */
export function isOwnNoteKey(key: string, ownerId: string): boolean {
  return (
    key.startsWith(`${ownerId}/`) &&
    key.toLowerCase().endsWith(".pdf") &&
    !key.includes("..")
  );
}
