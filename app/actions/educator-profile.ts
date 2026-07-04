"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getProfileById } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { capabilitiesFor } from "@/lib/tiers/capabilities";
import { validateProfileDoc, ProfileValidationError } from "@/lib/profile/validate";
import { isOwnEducatorAssetUrl } from "@/lib/profile/asset-url";
import { cleanupEducatorAssetOrphans, collectReferencedAssetUrls } from "@/lib/profile/asset-cleanup";
import type { EducatorProfileDoc } from "@/lib/types/profile-doc";

export interface ProfileActionState {
  error?: string;
}

export interface SaveEducatorProfileInput {
  avatarUrl: string | null;
  roleLabel: string | null;
  headline: string | null;
  hourlyRateCents: number | null;
  subjectTags: string[];
  doc: unknown;
}


/**
 * Persist the educator's own profile. Validates the body doc (auto-clean + limits) and writes an
 * EXPLICIT column whitelist — never tier / is_verified / verified_* / published_at, so the
 * admin-field and published_at triggers never fire on a normal self-save. See plan §5.6.
 */
export async function saveEducatorProfileAction(
  input: SaveEducatorProfileInput,
): Promise<ProfileActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators have a public profile." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Your educator account is awaiting approval." };
  }

  const ep = await getEducatorProfile(profile.id);
  const maxImages = capabilitiesFor(ep?.tier).maxImages;

  let doc: EducatorProfileDoc;
  try {
    doc = validateProfileDoc(input.doc, profile.id, { maxImages });
  } catch (e) {
    if (e instanceof ProfileValidationError) return { error: e.message };
    return { error: "Profile content could not be saved." };
  }

  const avatarUrl = isOwnEducatorAssetUrl(input.avatarUrl, profile.id) ? input.avatarUrl!.trim() : null;
  const roleLabel = input.roleLabel?.trim().slice(0, 120) || null;
  const headline = input.headline?.trim().slice(0, 160) || null;
  const hourlyRateCents =
    input.hourlyRateCents == null || !Number.isFinite(input.hourlyRateCents) || input.hourlyRateCents < 0
      ? null
      : Math.floor(input.hourlyRateCents);
  const subjectTags = Array.isArray(input.subjectTags)
    ? Array.from(new Set(input.subjectTags.map((t) => String(t).trim()).filter(Boolean))).slice(0, 20)
    : [];

  const supabase = await createClient();
  const { error } = await supabase.from("educator_profiles").upsert(
    {
      educator_id: profile.id,
      avatar_url: avatarUrl,
      role_label: roleLabel,
      headline,
      hourly_rate_cents: hourlyRateCents,
      subject_tags: subjectTags.length ? subjectTags : null,
      profile_doc: doc,
    },
    { onConflict: "educator_id" },
  );

  if (error) return { error: "Profile could not be saved." };

  /* Storage backstop: drop any asset the saved profile no longer references (replaced avatars,
     removed photos, abandoned uploads). Best-effort — never fails the save. */
  await cleanupEducatorAssetOrphans(supabase, profile.id, collectReferencedAssetUrls(doc, avatarUrl));

  revalidatePath("/profile");
  revalidatePath(`/educators/${profile.id}`);
  return {};
}

/** Toggle public visibility. The published_at timestamp is trigger-managed; we only write the flag. */
export async function setProfilePublishedAction(publish: boolean): Promise<ProfileActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators have a public profile." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Your educator account is awaiting approval." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("educator_profiles")
    .update({ is_published: publish })
    .eq("educator_id", profile.id);

  if (error) return { error: "Profile visibility could not be updated." };

  revalidatePath("/profile");
  revalidatePath(`/educators/${profile.id}`);
  return {};
}

/**
 * Admin-only guard shared by the two admin-side editor actions. Confirms the caller is an admin and
 * the TARGET is an educator-capable row (educator or admin) — never a student — so an admin cannot
 * materialise an educator_profiles row for a non-educator (the educator_profiles_insert_admin RLS
 * policy only checks the caller, not the target). Returns an error state, or null when allowed.
 */
async function ensureAdminEditingEducator(educatorId: string): Promise<ProfileActionState | null> {
  const me = await getCurrentProfile();
  if (!me) return { error: "Sign in required." };
  if (me.role !== "admin") return { error: "Admins only." };
  const target = await getProfileById(educatorId);
  if (!target) return { error: "Educator not found." };
  if (target.role !== "educator" && target.role !== "admin") {
    return { error: "Profiles can only be edited for educators." };
  }
  return null;
}

/**
 * Admin edits ANOTHER educator's public profile (the /admin/educators/<id>/profile builder). Mirrors
 * saveEducatorProfileAction but writes the TARGET educatorId. Every untrusted value is pinned to the
 * TARGET, not the caller: validateProfileDoc(doc, educatorId) origin-pins images to the target's
 * storage prefix, and isOwnEducatorAssetUrl(avatar, educatorId) gates the avatar the same way. The
 * upsert uses the SAME explicit column whitelist as the self action — never tier / is_verified /
 * slug / published_at — because the enforce_educator_admin_fields trigger early-returns for admins,
 * so the whitelist is the only guard on those admin-controlled columns.
 */
export async function adminSaveEducatorProfileAction(
  educatorId: string,
  input: SaveEducatorProfileInput,
): Promise<ProfileActionState> {
  const denied = await ensureAdminEditingEducator(educatorId);
  if (denied) return denied;

  const ep = await getEducatorProfile(educatorId);
  const maxImages = capabilitiesFor(ep?.tier).maxImages;

  let doc: EducatorProfileDoc;
  try {
    doc = validateProfileDoc(input.doc, educatorId, { maxImages });
  } catch (e) {
    if (e instanceof ProfileValidationError) return { error: e.message };
    return { error: "Profile content could not be saved." };
  }

  const avatarUrl = isOwnEducatorAssetUrl(input.avatarUrl, educatorId) ? input.avatarUrl!.trim() : null;
  const roleLabel = input.roleLabel?.trim().slice(0, 120) || null;
  const headline = input.headline?.trim().slice(0, 160) || null;
  const hourlyRateCents =
    input.hourlyRateCents == null || !Number.isFinite(input.hourlyRateCents) || input.hourlyRateCents < 0
      ? null
      : Math.floor(input.hourlyRateCents);
  const subjectTags = Array.isArray(input.subjectTags)
    ? Array.from(new Set(input.subjectTags.map((t) => String(t).trim()).filter(Boolean))).slice(0, 20)
    : [];

  const supabase = await createClient();
  const { error } = await supabase.from("educator_profiles").upsert(
    {
      educator_id: educatorId,
      avatar_url: avatarUrl,
      role_label: roleLabel,
      headline,
      hourly_rate_cents: hourlyRateCents,
      subject_tags: subjectTags.length ? subjectTags : null,
      profile_doc: doc,
    },
    { onConflict: "educator_id" },
  );

  if (error) return { error: "Profile could not be saved." };

  /* Same storage backstop as the self-save; admin lists/deletes the target's prefix via the admin
     branch on the educator-assets storage policies. */
  await cleanupEducatorAssetOrphans(supabase, educatorId, collectReferencedAssetUrls(doc, avatarUrl));

  revalidatePath(`/admin/educators/${educatorId}/edit`);
  revalidatePath("/admin/educators");
  revalidatePath("/educators");
  revalidatePath(`/educators/${educatorId}`);
  return {};
}

/** Admin toggles another educator's public visibility. published_at stays trigger-managed. */
export async function adminSetProfilePublishedAction(
  educatorId: string,
  publish: boolean,
): Promise<ProfileActionState> {
  const denied = await ensureAdminEditingEducator(educatorId);
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase
    .from("educator_profiles")
    .update({ is_published: publish })
    .eq("educator_id", educatorId);

  if (error) return { error: "Profile visibility could not be updated." };

  revalidatePath(`/admin/educators/${educatorId}/edit`);
  revalidatePath("/admin/educators");
  revalidatePath("/educators");
  revalidatePath(`/educators/${educatorId}`);
  return {};
}
