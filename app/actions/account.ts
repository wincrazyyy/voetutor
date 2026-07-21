"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export interface AccountNameActionState {
  error?: string;
  ok?: boolean;
}

const NAME_MAX = 100;

/**
 * Any signed-in user updates their own name on the shared profiles row — the "Your name" section of
 * the Settings Account card, shared by EVERY role (student, educator, admin). Trim, required,
 * 100-char clamp, and display_name kept in sync with the combined name, since getDisplayName
 * prefers display_name and a stale value would mask the change everywhere. Self-only: RLS
 * (profiles_update_self_or_admin) is the real gate, and protect_profile_role does not lock the name
 * columns, so a plain user-client update is permitted. (The admin student-edit page writes a
 * student's name through adminUpdateStudentProfileAction instead.)
 */
export async function updateAccountNameAction(input: {
  firstName: string;
  lastName: string;
}): Promise<AccountNameActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in required." };

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) return { error: "First name is required." };
  if (!lastName) return { error: "Last name is required." };
  if (firstName.length > NAME_MAX || lastName.length > NAME_MAX) {
    return { error: "Name is too long." };
  }

  const displayName = `${firstName} ${lastName}`.trim();
  const { error } = await supabase
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName, display_name: displayName })
    .eq("id", user.id);
  if (error) return { error: error.message };

  /* Name changes ripple into the sidebar/navbar identity chip. */
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { ok: true };
}
