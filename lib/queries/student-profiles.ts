import { createClient } from "@/lib/supabase/server";
import type { StudentProfile } from "@/lib/types/database";

/**
 * Reads a student's enrolment-details sidecar. RLS (student_profiles_select_self_or_admin) restricts
 * this to the student themselves or an admin. Returns null if there is no row yet (e.g. a student who
 * signed up before the sidecar existed) or the caller isn't allowed to see it.
 */
export async function getStudentProfile(studentId: string): Promise<StudentProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_profiles")
    .select("student_id, whatsapp_number, school, school_year, courses, target_grade, created_at, updated_at")
    .eq("student_id", studentId)
    .maybeSingle();

  /* Throw on a real read error rather than returning null — a null must mean "no row yet", not a
     transient failure. Otherwise Settings would render a blank form whose Save upserts NULLs over the
     student's real details. (maybeSingle returns no error for the zero-rows case.) */
  if (error) throw error;
  return (data as StudentProfile | null) ?? null;
}
