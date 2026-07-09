"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";

export interface RosterActionState {
  error?: string;
}

export interface AddByEmailState {
  error?: string;
  status?: "enrolled" | "already_enrolled" | "not_found";
  studentName?: string;
}

interface GateSuccess {
  profile: { id: string; role: string; is_approved: boolean };
}
interface GateFailure {
  error: string;
}

async function requireEducatorOrAdmin(): Promise<GateSuccess | GateFailure> {
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
async function ownsClass(
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

/**
 * Kick a student from a class. Does NOT delete user_video_progress (keyed by user+video, not
 * enrollment) — the student simply loses access; re-adding restores their prior progress view.
 */
export async function removeStudentAction(
  classId: string,
  studentId: string,
): Promise<RosterActionState> {
  const gate = await requireEducatorOrAdmin();
  if ("error" in gate) return { error: gate.error };
  const { profile } = gate;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, profile, classId))) {
    return { error: "You do not manage this class." };
  }

  const { error } = await supabase
    .from("class_enrollments")
    .delete()
    .eq("class_id", classId)
    .eq("user_id", studentId);
  if (error) return { error: error.message };

  revalidatePath(`/class/${classId}`);
  revalidatePath(`/class/${classId}/edit`);
  revalidatePath("/", "layout");
  return {};
}

/**
 * Move a student to another of the caller's own classes, atomically. Delegates to the
 * educator_move_student SECURITY DEFINER RPC, which authorizes both classes and runs the dest INSERT +
 * source DELETE in ONE transaction — so the student is never left in both classes or in neither, and a
 * stale/forged id not enrolled in the source can't turn Move into a silent enroll (returns not_in_source).
 */
export async function moveStudentAction(
  studentId: string,
  fromClassId: string,
  toClassId: string,
): Promise<RosterActionState> {
  const gate = await requireEducatorOrAdmin();
  if ("error" in gate) return { error: gate.error };
  if (fromClassId === toClassId) return { error: "Pick a different class." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("educator_move_student", {
    p_student_id: studentId,
    p_from_class_id: fromClassId,
    p_to_class_id: toClassId,
  });
  if (error) return { error: error.message };
  if (data === "not_in_source") return { error: "That student is no longer in this class." };

  revalidatePath(`/class/${fromClassId}`);
  revalidatePath(`/class/${fromClassId}/edit`);
  revalidatePath(`/class/${toClassId}`);
  revalidatePath("/", "layout");
  return {};
}

/**
 * Add a student to a class by email via the educator_enroll_student_by_email RPC (the one roster step
 * RLS cannot do — email -> user id). Maps the RPC status to a friendly result for inline surfacing.
 */
export async function addStudentByEmailAction(
  classId: string,
  email: string,
): Promise<AddByEmailState> {
  const gate = await requireEducatorOrAdmin();
  if ("error" in gate) return { error: gate.error };

  const trimmed = email.trim();
  if (!trimmed) return { error: "Enter an email address." };
  if (trimmed.length > 255) return { error: "Email must be 255 characters or fewer." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("educator_enroll_student_by_email", {
    p_class_id: classId,
    p_email: trimmed,
  });
  if (error) return { error: error.message };

  const row = ((data ?? []) as Array<{ status: string; student_name: string | null }>)[0];
  if (!row) return { error: "Could not add the student." };

  if (row.status === "enrolled") {
    revalidatePath(`/class/${classId}`);
    revalidatePath(`/class/${classId}/edit`);
    revalidatePath("/", "layout");
  }
  return {
    status: row.status as AddByEmailState["status"],
    studentName: row.student_name ?? undefined,
  };
}
