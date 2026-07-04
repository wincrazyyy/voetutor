"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isOwnAvatarUrl } from "@/lib/avatar/asset-url";

/**
 * Sets (or clears, with null) the caller's account avatar. The URL comes from a client-side upload to
 * the owner-keyed `avatars` bucket; we re-validate it is an https object under THIS user's own
 * avatars/{uid}/ prefix (isOwnAvatarUrl) so a caller can't point their avatar_url at an arbitrary URL.
 * RLS (profiles_update_self_or_admin) is the real backstop; avatar_url is not locked by
 * protect_profile_role, so a self-update is permitted. Revalidates the whole layout so the navbar,
 * sidebar, and every server-rendered identity chip pick up the change.
 */
export async function updateAvatarAction(url: string | null): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  let value: string | null = null;
  if (url !== null) {
    if (!isOwnAvatarUrl(url, user.id)) return { error: "That image could not be used as your avatar." };
    value = url;
  }

  const { error } = await supabase.from("profiles").update({ avatar_url: value }).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return {};
}
