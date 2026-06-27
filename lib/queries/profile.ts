import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, display_name, role, is_approved, approved_by, approved_at, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile | null) ?? null;
}

/**
 * Read any single profile by id. Reads public.profiles DIRECTLY (not profiles_public) because the
 * caller needs the literal `role` column to gate the admin-side editor's target check — and only an
 * admin (or the row's owner) can SELECT here under profiles_select_self_or_admin, so this is a no-op
 * for everyone else. Returns null when not found / not visible to the caller.
 */
export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, display_name, role, is_approved, approved_by, approved_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  return (data as Profile | null) ?? null;
}
