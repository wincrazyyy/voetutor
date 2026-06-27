const STORAGE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

/**
 * Single source of truth for the per-educator image origin-pin — shared by the save action, the
 * validator, and the public renderer so they can never disagree on what is safe.
 *
 * True only when `url` is an https object on OUR Supabase Storage origin, under this educator's own
 * `educator-assets/{educatorId}/` prefix. It rejects any percent-encoding in the path: a legit
 * uploaded path (`{uuid}.{ext}`) never contains `%`, and an encoded slash/dot (`..%2f…`) would pass
 * a naive `pathname.startsWith` here yet be decoded into a different folder by the storage server —
 * so stripping all `%` closes that traversal.
 */
export function isOwnEducatorAssetUrl(url: string | null | undefined, educatorId: string): boolean {
  const trimmed = url?.trim() ?? "";
  if (!trimmed || !STORAGE_ORIGIN || !educatorId) return false;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.pathname.includes("%")) return false;
  return (
    u.origin === STORAGE_ORIGIN &&
    u.pathname.startsWith(`/storage/v1/object/public/educator-assets/${educatorId}/`)
  );
}
