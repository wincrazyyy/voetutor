"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";

export interface StudentProfileActionState {
  error?: string;
  ok?: boolean;
}

const LIMITS = {
  name: 100,
  whatsapp_number: 50,
  school: 200,
  school_year: 60,
  target_grade: 100,
} as const;

/**
 * Students save their own enrolment details from Settings — and, only when a name is actually
 * provided, their name too. Upserts the student_profiles sidecar (the enrolment fields) and
 * optionally updates the shared profiles row. The name fields are OPTIONAL by design: the Settings
 * page owns the name via the shared AccountNameForm and submits an enrolment-only payload, which
 * must never overwrite profiles first/last/display_name with a stale value. Self-only — RLS
 * (student_profiles_update_self / _insert_self + the profiles self-update policy) is the real gate;
 * the role check just yields a clean message. Values are clamped to the column caps defensively.
 */
export async function updateStudentProfileAction(input: {
  firstName?: string;
  lastName?: string;
  whatsappNumber: string;
  school: string;
  schoolYear: string;
  targetGrade: string;
}): Promise<StudentProfileActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "student") {
    return { error: "Only students can edit these details." };
  }

  /* A payload carrying either name field is a deliberate name update and is fully validated;
     a payload carrying neither leaves the profiles name untouched. */
  const wantsNameUpdate = input.firstName !== undefined || input.lastName !== undefined;
  const firstName = (input.firstName ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  if (wantsNameUpdate) {
    if (!firstName) return { error: "First name is required." };
    if (!lastName) return { error: "Last name is required." };
    if (firstName.length > LIMITS.name || lastName.length > LIMITS.name) {
      return { error: "Name is too long." };
    }
  }

  const clamp = (value: string, max: number) => value.trim().slice(0, max);
  const whatsappNumber = clamp(input.whatsappNumber, LIMITS.whatsapp_number);
  const school = clamp(input.school, LIMITS.school);
  const schoolYear = clamp(input.schoolYear, LIMITS.school_year);
  const targetGrade = clamp(input.targetGrade, LIMITS.target_grade);

  const supabase = await createClient();

  /* Upsert the sidecar FIRST — it carries the CHECK constraints + insert/update RLS, so it's the write
     that can actually fail. Only touch the profiles name (which effectively never fails) once it's
     persisted, so a failure returns cleanly without a half-applied change. */
  const { error: sidecarError } = await supabase.from("student_profiles").upsert(
    {
      student_id: profile.id,
      whatsapp_number: whatsappNumber || null,
      school: school || null,
      school_year: schoolYear || null,
      target_grade: targetGrade || null,
    },
    { onConflict: "student_id" },
  );
  if (sidecarError) return { error: sidecarError.message };

  if (wantsNameUpdate) {
    const displayName = `${firstName} ${lastName}`.trim();
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ first_name: firstName, last_name: lastName, display_name: displayName })
      .eq("id", profile.id);
    if (profileError) return { error: profileError.message };
  }

  /* Name changes ripple into the sidebar/navbar identity chip. */
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { ok: true };
}
