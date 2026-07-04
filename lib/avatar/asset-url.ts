const STORAGE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

/**
 * Origin-pin for account avatars — true only for an https object on OUR Supabase Storage origin under
 * this user's own public `avatars/{userId}/` prefix. Rejects any `%` in the path (a real upload path
 * never contains one; an encoded slash/dot would pass a naive startsWith yet decode into another
 * folder). updateAvatarAction validates the client-supplied URL through this before persisting it, so
 * a caller cannot smuggle an arbitrary URL into their own profiles.avatar_url. Pure + server-safe.
 */
export function isOwnAvatarUrl(url: string | null | undefined, userId: string): boolean {
  const trimmed = url?.trim() ?? "";
  if (!trimmed || !STORAGE_ORIGIN || !userId) return false;
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
    u.pathname.startsWith(`/storage/v1/object/public/avatars/${userId}/`)
  );
}
