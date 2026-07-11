import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";

/**
 * Shared caller gates for roster-shaped mutations (class-roster actions + createStudentAccountAction).
 * Deliberately a plain server module, NOT a "use server" file — exporting these from an actions file
 * would make the gates themselves client-callable server actions.
 */

export interface GateSuccess {
  profile: { id: string; role: string; is_approved: boolean };
}
export interface GateFailure {
  error: string;
}

export async function requireEducatorOrAdmin(): Promise<GateSuccess | GateFailure> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can manage a roster." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }
  return { profile: { id: profile.id, role: profile.role, is_approved: profile.is_approved } };
}

/** Owner/admin check on ONE class, giving remove + move a friendly pre-error (RLS is the real gate). */
export async function ownsClass(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: { id: string; role: string },
  classId: string,
): Promise<boolean> {
  if (profile.role === "admin") return true;
  const { data } = await supabase
    .from("classes")
    .select("educator_id")
    .eq("id", classId)
    .maybeSingle();
  return (data as { educator_id: string | null } | null)?.educator_id === profile.id;
}
