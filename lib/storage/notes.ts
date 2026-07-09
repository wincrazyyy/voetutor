import "server-only";

/**
 * Storage identity/parse helpers for the notes (PDF) library. The BYTES live in Cloudflare R2 under
 * an owner-keyed object `{owner_id}/{uuid}.pdf`; the S3 calls that read/write/delete them live in
 * lib/storage/r2.ts. This module only builds and parses the value stored in `resources.file_url`.
 *
 * The bucket is app-gated (R2 has no per-user RLS) — /api/resources/[id]/download is the read
 * boundary: it RLS-checks the caller's access to the `resources` row, THEN 302s to a short-lived R2
 * presigned GET. See plans/r2-notes-migration.md.
 */

/** Build the value stored in resources.file_url — the bare R2 object key `{ownerId}/{uuid}.pdf`. */
export function noteFileUrl(ownerId: string, uuid: string): string {
  return `${ownerId}/${uuid}.pdf`;
}

/**
 * Validate + return the R2 object KEY stored in resources.file_url. file_url holds a bare owner-keyed
 * `.pdf` key; anything else — path traversal, a URL, a non-pdf — is rejected as null (also guards
 * against a stray pre-R2 row that still held a Supabase https URL).
 */
export function noteKeyFromFileUrl(fileUrl: string): string | null {
  if (
    !fileUrl ||
    fileUrl.includes("..") ||
    fileUrl.includes("://") ||
    !fileUrl.toLowerCase().endsWith(".pdf")
  ) {
    return null;
  }
  return fileUrl;
}

/** True when a key is a well-formed owner-keyed note object owned by `ownerId` (rejects traversal). */
export function isOwnNoteKey(key: string, ownerId: string): boolean {
  return (
    key.startsWith(`${ownerId}/`) &&
    key.toLowerCase().endsWith(".pdf") &&
    !key.includes("..")
  );
}
