import "server-only";

/**
 * Shared constants + helpers for the notes (PDF) storage bucket. The bucket is PRIVATE and keyed by
 * OWNER: every object lives at class-resources/{owner_id}/{uuid}.pdf. Writes are owner-only (storage
 * RLS); reads go through /api/resources/[id]/download, which mints a short-lived signed URL with the
 * service-role client AFTER a row-level membership check. See plans/content-library.md §3.4 / §4.
 */
export const NOTES_BUCKET = "class-resources";
export const NOTES_STORAGE_MARKER = `/storage/v1/object/${NOTES_BUCKET}/`;

/** The object path inside the bucket, recovered from a stored file_url — or null if it isn't ours. */
export function notePathFromUrl(fileUrl: string): string | null {
  const markerIndex = fileUrl.indexOf(NOTES_STORAGE_MARKER);
  if (markerIndex === -1) return null;
  const path = decodeURIComponent(fileUrl.slice(markerIndex + NOTES_STORAGE_MARKER.length));
  if (!path || path.includes("..") || !path.toLowerCase().endsWith(".pdf")) return null;
  return path;
}

/** Build the canonical stored file_url for an object path. */
export function noteFileUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${NOTES_STORAGE_MARKER}${path}`;
}

/** True when a storage path is a well-formed owner-keyed note object owned by `ownerId`. */
export function isOwnNotePath(path: string, ownerId: string): boolean {
  return (
    path.startsWith(`${ownerId}/`) &&
    path.toLowerCase().endsWith(".pdf") &&
    !path.includes("..")
  );
}
