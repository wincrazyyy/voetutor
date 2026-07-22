/**
 * Shared hard cap for every educator-generated link (class invites + student setup links):
 * no link may outlive 7 days from creation, regardless of any educator-chosen expiry.
 * Pure and client-safe — imported by server actions, the /welcome route, the invite query
 * layer, AND the client-side invite manager, so it must never import server-only modules.
 */
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * TS mirror of the SQL effective-expiry expression enforced by get_class_invite_preview and
 * redeem_class_invite: LEAST(COALESCE(expires_at, created_at + 7 days), created_at + 7 days).
 * Lives here (not lib/queries/class-invites.ts) so the client-side invite manager can import
 * it without dragging the server Supabase client into a client bundle.
 */
export function effectiveInviteExpiry(createdAt: string, expiresAt: string | null): Date {
  const capMs = new Date(createdAt).getTime() + SEVEN_DAYS_MS;
  const chosenMs = expiresAt ? new Date(expiresAt).getTime() : capMs;
  return new Date(Math.min(chosenMs, capMs));
}
