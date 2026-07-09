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

/**
 * Every educator-capable account: approved educators plus admins (admins are educators with extra
 * perms and have public profiles too). Drives the admin "All profiles" tab. Admin SELECT RLS on
 * profiles permits this read; pair with getEducatorProfilesByIds to fetch each one's profile status.
 */
export async function getAllPlatformEducators(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, display_name, role, is_approved, approved_by, approved_at, created_at, updated_at")
    .or("role.eq.admin,and(role.eq.educator,is_approved.eq.true)")
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as Profile[];
}

export interface StudentAccount extends Profile {
  enrolledCount: number;
}

/**
 * Every student account, for the admin students console. Reads public.profiles directly (admin SELECT
 * RLS permits it) and attaches each student's enrolled-class count via a single grouped
 * class_enrollments read (admins can SELECT every enrolment row under enrollments_select_authorized).
 */
export async function getAllStudents(): Promise<StudentAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, display_name, avatar_url, role, is_approved, approved_by, approved_at, created_at, updated_at")
    .eq("role", "student")
    .order("created_at", { ascending: false });
  const students = (data ?? []) as Profile[];
  if (students.length === 0) return [];

  const ids = students.map((s) => s.id);
  const { data: enrollmentRows } = await supabase
    .from("class_enrollments")
    .select("user_id")
    .in("user_id", ids);
  const counts = new Map<string, number>();
  for (const row of (enrollmentRows ?? []) as Array<{ user_id: string }>) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  return students.map((s) => ({ ...s, enrolledCount: counts.get(s.id) ?? 0 }));
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
