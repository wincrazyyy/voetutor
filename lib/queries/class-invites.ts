import { createClient } from "@/lib/supabase/server";
import { effectiveInviteExpiry } from "@/lib/utils/link-expiry";
import type { ClassInvite, ClassInvitePreview, ProfilePublic } from "@/lib/types/database";

export type ClassInviteStatus = "pending" | "redeemed" | "revoked" | "expired";

export interface ClassInviteRow extends ClassInvite {
  status: ClassInviteStatus;
  redeemer: ProfilePublic | null;
  /** Audience label of a scoped invite (the pass name); null = full-access invite. */
  pass_name: string | null;
}

/** Derives the display status of an invite. Revoked wins over redeemed wins over expired,
 *  mirroring the reason precedence in the get_class_invite_preview RPC — including its 7-day
 *  effective expiry, so legacy never-expiring rows correctly read "expired" after a week. */
export function deriveClassInviteStatus(
  invite: Pick<ClassInvite, "revoked_at" | "redeemed_at" | "expires_at" | "created_at">,
): ClassInviteStatus {
  if (invite.revoked_at) return "revoked";
  if (invite.redeemed_at) return "redeemed";
  if (effectiveInviteExpiry(invite.created_at, invite.expires_at).getTime() <= Date.now()) {
    return "expired";
  }
  return "pending";
}

/**
 * Every invite for a class, newest first, with the redeemer's public identity joined in.
 * RLS-gated: only the class educator or an admin sees rows — students get an empty list.
 */
export async function getClassInvites(classId: string): Promise<ClassInviteRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_invites")
    .select(
      "id, token, class_id, pass_id, created_by, email, note, expires_at, revoked_at, redeemed_by, redeemed_at, created_at, updated_at, class_passes(name)",
    )
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Array<ClassInvite & { class_passes: { name: string } | null }>;
  if (rows.length === 0) return [];

  const redeemerIds = Array.from(
    new Set(rows.map((r) => r.redeemed_by).filter((id): id is string => Boolean(id))),
  );

  let redeemerMap = new Map<string, ProfilePublic>();
  if (redeemerIds.length > 0) {
    const { data: redeemers } = await supabase
      .from("profiles_public")
      .select("id, first_name, last_name, display_name, role, is_approved, avatar_url")
      .in("id", redeemerIds);
    redeemerMap = new Map(((redeemers ?? []) as ProfilePublic[]).map((r) => [r.id, r]));
  }

  return rows.map(({ class_passes, ...r }) => ({
    ...r,
    status: deriveClassInviteStatus(r),
    redeemer: r.redeemed_by ? (redeemerMap.get(r.redeemed_by) ?? null) : null,
    pass_name: class_passes?.name ?? null,
  }));
}

/**
 * Anon-safe preview of an invite via the SECURITY DEFINER get_class_invite_preview RPC.
 * Returns null for an unknown token — the landing page renders an "invalid invite" state.
 */
export async function getClassInvitePreview(token: string): Promise<ClassInvitePreview | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("get_class_invite_preview", { p_token: token })
    .maybeSingle();
  return (data as ClassInvitePreview | null) ?? null;
}
