import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";

export async function getPendingEducators(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, display_name, role, is_approved, approved_by, approved_at, created_at, updated_at")
    .eq("role", "educator")
    .eq("is_approved", false)
    .order("created_at", { ascending: true });
  return (data ?? []) as Profile[];
}

export async function getApprovedEducators(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, display_name, role, is_approved, approved_by, approved_at, created_at, updated_at")
    .eq("role", "educator")
    .eq("is_approved", true)
    .order("approved_at", { ascending: false });
  return (data ?? []) as Profile[];
}

export async function getPendingEducatorCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "educator")
    .eq("is_approved", false);
  return count ?? 0;
}
