"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";

export interface ClassInviteActionState {
  error?: string;
}

export interface CreateClassInviteState {
  url?: string;
  error?: string;
}

export interface CreateClassInviteInput {
  email?: string;
  note?: string;
  expiresAt?: string;
}

async function resolveAppOrigin(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function createClassInviteAction(
  classId: string,
  input: CreateClassInviteInput,
): Promise<CreateClassInviteState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can create invite links." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }

  const email = input.email?.trim().toLowerCase() || null;
  if (email) {
    if (email.length > 255) return { error: "Email must be 255 characters or fewer." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  }

  const note = input.note?.trim() || null;
  if (note && note.length > 200) return { error: "Note must be 200 characters or fewer." };

  let expiresAt: string | null = null;
  if (input.expiresAt) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime())) return { error: "Expiry date is not valid." };
    if (parsed.getTime() <= Date.now()) return { error: "Expiry must be in the future." };
    expiresAt = parsed.toISOString();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_invites")
    .insert({
      class_id: classId,
      created_by: profile.id,
      email,
      note,
      expires_at: expiresAt,
    })
    .select("token")
    .single();

  if (error) return { error: error.message };

  const origin = await resolveAppOrigin();
  revalidatePath(`/class/${classId}/invite`);
  return { url: `${origin}/invite/${(data as { token: string }).token}` };
}

export async function revokeClassInviteAction(
  inviteId: string,
  classId: string,
): Promise<ClassInviteActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("class_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("class_id", classId);

  if (error) return { error: error.message };

  revalidatePath(`/class/${classId}/invite`);
  return {};
}

export async function deleteClassInviteAction(
  inviteId: string,
  classId: string,
): Promise<ClassInviteActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("class_invites")
    .delete()
    .eq("id", inviteId)
    .eq("class_id", classId);

  if (error) return { error: error.message };

  revalidatePath(`/class/${classId}/invite`);
  return {};
}

export async function redeemInviteAction(token: string): Promise<ClassInviteActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_class_invite", { p_token: token });
  if (error) return { error: error.message };
  if (!data) return { error: "This invite link is not valid." };

  revalidatePath("/", "layout");
  redirect(`/class/${data as string}`);
}
