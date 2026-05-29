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
