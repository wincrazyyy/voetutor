"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getProfileById } from "@/lib/queries/profile";

export interface AdminStudentActionState {
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

const PAGE = 100;
const PLACEHOLDER = ".emptyFolderPlaceholder";

/**
 * Best-effort removal of every object under `avatars/{prefix}/`. Mirrors the module-private
 * wipeStoragePrefix in app/actions/educators.ts (list + remove, paged). Never throws — a storage
 * hiccup must not fail the moderation action once the URL is already cleared.
 */
async function wipeAvatarPrefix(admin: SupabaseClient, prefix: string): Promise<void> {
  try {
    const toRemove: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.storage
        .from("avatars")
        .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) break;
      for (const obj of data) {
        if (!obj.name || obj.name === PLACEHOLDER) continue;
        toRemove.push(`${prefix}/${obj.name}`);
      }
      if (data.length < PAGE) break;
    }
    if (toRemove.length) await admin.storage.from("avatars").remove(toRemove);
  } catch {
    /* best-effort */
  }
}

/**
 * Shared gate for the admin student-moderation actions: the caller must be an admin and the
 * target must be a student account. Returns an error string, or null when authorized.
 */
async function requireAdminAndStudentTarget(studentId: string): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me) return "Sign in required.";
  if (me.role !== "admin") return "Admins only.";

  const target = await getProfileById(studentId);
  if (!target) return "Account not found.";
  if (target.role !== "student") return "Only student accounts can be edited here.";
  return null;
}

/**
 * Admin edits a student's name + enrolment details from /admin/students/[studentId]. Validation
 * mirrors updateStudentProfileAction (same LIMITS, trim/clamp, sidecar-upsert-first ordering).
 * Writes with the NORMAL user client: the student_profiles upsert is authorized by the new
 * student_profiles_update_admin / _insert_admin policies, the profiles name update by
 * profiles_update_self_or_admin. Educators have no path here — admin-only by both the gate and RLS.
 */
export async function adminUpdateStudentProfileAction(
  studentId: string,
  input: {
    firstName: string;
    lastName: string;
    whatsappNumber: string;
    school: string;
    schoolYear: string;
    targetGrade: string;
  },
): Promise<AdminStudentActionState> {
  const gateError = await requireAdminAndStudentTarget(studentId);
  if (gateError) return { error: gateError };

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) return { error: "First name is required." };
  if (!lastName) return { error: "Last name is required." };
  if (firstName.length > LIMITS.name || lastName.length > LIMITS.name) {
    return { error: "Name is too long." };
  }

  const clamp = (value: string, max: number) => value.trim().slice(0, max);
  const whatsappNumber = clamp(input.whatsappNumber, LIMITS.whatsapp_number);
  const school = clamp(input.school, LIMITS.school);
  const schoolYear = clamp(input.schoolYear, LIMITS.school_year);
  const targetGrade = clamp(input.targetGrade, LIMITS.target_grade);

  const supabase = await createClient();

  /* Upsert the sidecar FIRST — it carries the CHECK constraints + insert/update RLS, so it's the
     write that can actually fail. Only touch the profiles name once it's persisted, so a failure
     returns cleanly without a half-applied change. */
  const { error: sidecarError } = await supabase.from("student_profiles").upsert(
    {
      student_id: studentId,
      whatsapp_number: whatsappNumber || null,
      school: school || null,
      school_year: schoolYear || null,
      target_grade: targetGrade || null,
    },
    { onConflict: "student_id" },
  );
  if (sidecarError) return { error: sidecarError.message };

  const displayName = `${firstName} ${lastName}`.trim();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName, display_name: displayName })
    .eq("id", studentId);
  if (profileError) return { error: profileError.message };

  /* Name changes ripple into every identity chip (roster, forum, sidebar). */
  revalidatePath("/", "layout");
  revalidatePath("/admin/students");
  return { ok: true };
}

/**
 * Admin removes a student's account avatar (moderation). Two steps: (1) clear profiles.avatar_url
 * with the NORMAL user client (profiles_update_self_or_admin; avatar_url is not locked by
 * protect_profile_role); (2) best-effort SERVICE-ROLE wipe of the avatars/{studentId}/ storage
 * prefix — the bucket's delete policy is owner-keyed, so clearing the URL alone would leave the
 * bytes publicly served at a known URL. This makes this module the sixth sanctioned importer of
 * lib/supabase/admin.ts: the caller is authorized with the USER session FIRST (admin +
 * target-is-student), and the admin client is constructed only after — the
 * deleteEducatorAccountAction ordering.
 */
export async function adminRemoveStudentAvatarAction(
  studentId: string,
): Promise<AdminStudentActionState> {
  const gateError = await requireAdminAndStudentTarget(studentId);
  if (gateError) return { error: gateError };

  const supabase = await createClient();
  const { error: clearError } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", studentId);
  if (clearError) return { error: clearError.message };

  try {
    const admin = createAdminClient();
    await wipeAvatarPrefix(admin, studentId);
  } catch {
    /* Service role not configured — the URL is cleared; the object reap is best-effort. */
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/students");
  return { ok: true };
}
