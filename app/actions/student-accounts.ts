"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEducatorOrAdmin, ownsClass } from "@/lib/auth/educator-class-gate";
import { generateTempPassword } from "@/lib/auth/temp-password";

export interface CreateStudentAccountState {
  error?: string;
  emailExists?: boolean;
  credentials?: { email: string; tempPassword: string; studentName: string };
}

/**
 * Educator/admin provisions a student account directly: creates the auth user with a strong temporary
 * password (returned ONCE in the action result, never logged or persisted), flags the profile with
 * must_change_password via signup metadata, and auto-enrolls the student into the caller's class.
 * Optional student_profiles details (WhatsApp / school / school year / courses / target grade) are
 * passed through signup metadata and seeded by internal.handle_new_user — handy for migrating an
 * existing student from another platform. Each is nullable, truncated by the trigger to its column
 * cap, and remains editable by the student in Settings.
 *
 * Security contract: the caller is gated with the USER session (approved educator who owns the class,
 * or admin) BEFORE the service-role client is constructed. The enrollment INSERT uses the caller's own
 * RLS-checked client (enrollments_insert_educator_or_admin); on enrollment failure the freshly created
 * auth user is rolled back so no flagged orphan account is left behind.
 */
export async function createStudentAccountAction(
  classId: string,
  input: {
    firstName: string;
    lastName: string;
    email: string;
    whatsappNumber?: string;
    school?: string;
    schoolYear?: string;
    courses?: string;
    targetGrade?: string;
  },
): Promise<CreateStudentAccountState> {
  const gate = await requireEducatorOrAdmin();
  if ("error" in gate) return { error: gate.error };
  const { profile } = gate;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, profile, classId))) {
    return { error: "You do not manage this class." };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();

  if (!firstName || !lastName) return { error: "Enter the student's first and last name." };
  if (firstName.length > 100 || lastName.length > 100) {
    return { error: "Names must be 100 characters or fewer." };
  }
  if (!email) return { error: "Enter an email address." };
  if (email.length > 255) return { error: "Email must be 255 characters or fewer." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };

  const displayName = `${firstName} ${lastName}`.trim();
  if (displayName.length > 100) {
    return { error: "The combined first and last name must be 100 characters or fewer." };
  }
  const tempPassword = generateTempPassword();

  const details: Record<string, string> = {};
  const addDetail = (key: string, value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) details[key] = trimmed;
  };
  addDetail("whatsapp_number", input.whatsappNumber);
  addDetail("school", input.school);
  addDetail("school_year", input.schoolYear);
  addDetail("courses", input.courses);
  addDetail("target_grade", input.targetGrade);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      intended_role: "student",
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      must_change_password: true,
      ...details,
    },
  });

  if (error || !data?.user) {
    const code = (error as { code?: string } | null)?.code;
    const isDuplicate =
      code === "email_exists" ||
      (error?.message ?? "").toLowerCase().includes("already been registered");
    if (isDuplicate) {
      return {
        emailExists: true,
        error:
          "An account with this email already exists. Use “Existing account” to add them instead.",
      };
    }
    return { error: error?.message ?? "Could not create the account." };
  }

  const newUserId = data.user.id;

  const { error: enrollError } = await supabase
    .from("class_enrollments")
    .insert({ user_id: newUserId, class_id: classId });

  if (enrollError) {
    await admin.auth.admin.deleteUser(newUserId).then(
      () => undefined,
      () => undefined,
    );
    return { error: "Could not enroll the new account; nothing was created. Try again." };
  }

  revalidatePath(`/class/${classId}`);
  revalidatePath(`/class/${classId}/students`);
  revalidatePath("/", "layout");

  return { credentials: { email, tempPassword, studentName: displayName } };
}
