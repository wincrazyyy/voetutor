import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { capabilitiesFor, type EducatorTier, type TierCapabilities } from "@/lib/tiers/capabilities";
import type { Profile } from "@/lib/types/database";

export interface EducatorAccess {
  profile: Profile;
  isAdmin: boolean;
  tier: EducatorTier;
  /** Admin OR premium tier — the gate for classes / videos / question bank. */
  isPremium: boolean;
  caps: TierCapabilities;
}

/**
 * Resolve the signed-in user's educator tier + premium access WITHOUT redirecting (for server actions
 * and the sidebar). Admins are treated as premium. Returns profile=null when not signed in.
 */
export async function getEducatorAccess(): Promise<
  { profile: null } | EducatorAccess
> {
  const profile = await getCurrentProfile();
  if (!profile) return { profile: null };
  const isAdmin = profile.role === "admin";
  let tier: EducatorTier = isAdmin ? "premium" : "basic";
  if (profile.role === "educator") {
    const ep = await getEducatorProfile(profile.id);
    tier = ep?.tier ?? "basic";
  }
  const isPremium = isAdmin || tier === "premium";
  return { profile, isAdmin, tier, isPremium, caps: capabilitiesFor(tier) };
}

/**
 * Page/layout guard for educator surfaces. Mirrors the existing per-page checks (sign-in, pending,
 * role) and adds an optional premium gate. Redirects on failure; returns the resolved access on
 * success (profile is non-null past the redirects).
 */
export async function requireEducatorPage(opts?: { premium?: boolean }): Promise<EducatorAccess> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role === "educator" && !profile.is_approved) redirect("/pending");
  if (profile.role !== "educator" && profile.role !== "admin") redirect("/dashboard");

  const isAdmin = profile.role === "admin";
  let tier: EducatorTier = isAdmin ? "premium" : "basic";
  if (profile.role === "educator") {
    const ep = await getEducatorProfile(profile.id);
    tier = ep?.tier ?? "basic";
  }
  const isPremium = isAdmin || tier === "premium";
  /* A non-premium educator who reaches a premium URL directly is bounced to their hub with no hint
     that a premium tier exists — it's admin-granted, never advertised. */
  if (opts?.premium && !isPremium) redirect("/dashboard");

  return { profile, isAdmin, tier, isPremium, caps: capabilitiesFor(tier) };
}
