"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getProfileById } from "@/lib/queries/profile";
import { deleteVideo } from "@/lib/cloudflare/client";
import { wipeNotePrefix } from "@/lib/storage/r2";
import type { EducatorTier } from "@/lib/types/database";

export interface DeleteEducatorState {
  error?: string;
  ok?: boolean;
}

/**
 * Every SUPABASE storage bucket keyed by the user's id as the first path segment: profile images,
 * forum/announcement RTE images, and the account avatar. The DB cascade never reaches Storage, so
 * these are reaped out-of-band. See lib/profile/asset-cleanup.ts (educator-assets),
 * lib/forum/rte-image.ts (rte-images), lib/avatar/upload-avatar.ts (avatars).
 *
 * Note PDFs live in Cloudflare R2, reaped separately via wipeNotePrefix (below).
 */
const ASSET_BUCKETS = ["educator-assets", "rte-images", "avatars"] as const;
const PAGE = 100;
const PLACEHOLDER = ".emptyFolderPlaceholder";

/** Best-effort removal of every object under `{bucket}/{prefix}/`. Never throws. */
async function wipeStoragePrefix(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<void> {
  try {
    const toRemove: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) break;
      for (const obj of data) {
        if (!obj.name || obj.name === PLACEHOLDER) continue;
        toRemove.push(`${prefix}/${obj.name}`);
      }
      if (data.length < PAGE) break;
    }
    if (toRemove.length) await admin.storage.from(bucket).remove(toRemove);
  } catch {
    /* best-effort: a storage hiccup must not leave the account half-deleted */
  }
}

/**
 * Runs the full capture → cascade → reap for ANY account, shared by the educator and student delete
 * actions. Authorization + confirmation are the CALLER's responsibility — this must only be invoked
 * after the caller has verified admin + not-self + the target's role. Returns an error string on the
 * first hard failure; the external-asset reap (step 5) is best-effort and never blocks.
 *
 * Order matters:
 *  1. Capture the account's Cloudflare video uids while the rows still exist (the FK cascade can't
 *     reach Cloudflare). No rows for a student → empty list.
 *  2. Delete any verified reviews this user AUTHORED as a student (student_id) — pre-empts the
 *     chk_review_source_shape landmine: an ON DELETE SET NULL on educator_reviews.student_id would
 *     otherwise violate the CHECK and abort the whole delete once the verified-review path ships.
 *  3. Delete the account's CLASSES while educator_id still matches — classes.educator_id is
 *     ON DELETE SET NULL, so the account delete alone would leave them as ownerless, still-published
 *     ghost classes. Each class DELETE cascades its whole subtree via class_id ON DELETE CASCADE.
 *     No-op for a student (they own no classes).
 *  4. Hard-delete the auth user. profiles.id REFERENCES auth.users ON DELETE CASCADE, fanning out to
 *     the user's owner-keyed rows, enrolments + progress, forum posts/replies/upvotes, announcement
 *     reads, reports, etc. shouldSoftDelete stays false (default) so the cascade fires.
 *  5. Best-effort reap the external assets the cascade can't touch: Cloudflare videos + every
 *     storage bucket keyed by the user's id.
 */
async function deleteAccountAndAssets(
  admin: SupabaseClient,
  userId: string,
): Promise<{ error?: string }> {
  /* 1. Capture Cloudflare uids before the videos rows cascade away. */
  const { data: videoRows } = await admin
    .from("videos")
    .select("cloudflare_uid")
    .eq("owner_id", userId);
  const cloudflareUids = ((videoRows ?? []) as Array<{ cloudflare_uid: string | null }>)
    .map((v) => v.cloudflare_uid)
    .filter((uid): uid is string => Boolean(uid));

  /* 2. Reviews this user authored as a student (future verified path; no-op in v1). Pre-empts the
        chk_review_source_shape abort during the step-4 cascade. */
  const { error: reviewError } = await admin
    .from("educator_reviews")
    .delete()
    .eq("student_id", userId);
  if (reviewError) {
    return { error: `Failed to delete the account's authored reviews: ${reviewError.message}` };
  }

  /* 3. Their classes (while educator_id still matches), cascading the whole class subtree. */
  const { error: classError } = await admin.from("classes").delete().eq("educator_id", userId);
  if (classError) {
    return { error: `Failed to delete the account's classes: ${classError.message}` };
  }

  /* 4. The account itself — cascades the profile and everything owner-keyed off it. */
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return { error: `Failed to delete the account: ${deleteError.message}` };
  }

  /* 5. External assets (best-effort; the account is already gone at this point). */
  for (const uid of cloudflareUids) {
    await deleteVideo(uid).catch(() => undefined);
  }
  for (const bucket of ASSET_BUCKETS) {
    await wipeStoragePrefix(admin, bucket, userId);
  }
  await wipeNotePrefix(userId);

  return {};
}

/**
 * Admin-only, irreversible deletion of an entire EDUCATOR account and EVERYTHING tied to it —
 * leaving no ghost rows or orphaned assets. Admin accounts are non-deletable here: the target-role
 * guard rejects anything that isn't an educator (which also covers the caller's own admin row).
 *
 * The caller is authorized with the NORMAL user session FIRST (admin role + not self), exactly like
 * the other two sanctioned importers of the service-role client. Only then is the service-role admin
 * client constructed, because (a) profiles has no DELETE policy under FORCE RLS and (b) deleting the
 * auth.users row needs the auth admin API. The capture/cascade/reap steps live in the shared
 * deleteAccountAndAssets core.
 */
export async function deleteEducatorAccountAction(
  educatorId: string,
  confirmation: string,
): Promise<DeleteEducatorState> {
  const me = await getCurrentProfile();
  if (!me) return { error: "Sign in required." };
  if (me.role !== "admin") return { error: "Admins only." };
  if (educatorId === me.id) return { error: "You cannot delete your own account." };

  const target = await getProfileById(educatorId);
  if (!target) return { error: "Account not found." };
  if (target.role !== "educator") {
    return { error: "Admin accounts can't be deleted." };
  }

  /* Confirmation is the account's id — globally unique, so it can't accidentally match a different,
     same-named account, and (paste-blocked in the UI) is the deliberate "super gate" friction. */
  if (confirmation.trim() !== educatorId) {
    return { error: "Confirmation does not match the account ID." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Account deletion is not configured on this deployment." };
  }

  const core = await deleteAccountAndAssets(admin, educatorId);
  if (core.error) return { error: core.error };

  revalidatePath("/", "layout");
  revalidatePath("/educators");
  revalidatePath("/admin/educators");
  revalidatePath("/classes");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/approvals");
  revalidatePath(`/educators/${educatorId}`);

  return { ok: true };
}

/**
 * Admin-only, irreversible deletion of a STUDENT account and everything tied to it. Same shape as
 * deleteEducatorAccountAction but the target-role guard rejects anything that isn't a student, so the
 * students console can never nuke an educator/admin through the wrong action. The shared core's
 * class-delete + Cloudflare-reap steps are harmless no-ops (students own no classes/videos); the
 * account cascade removes their enrolments, progress, forum posts & replies, upvotes, announcement
 * read receipts, and filed reports.
 */
export async function deleteStudentAccountAction(
  studentId: string,
  confirmation: string,
): Promise<DeleteEducatorState> {
  const me = await getCurrentProfile();
  if (!me) return { error: "Sign in required." };
  if (me.role !== "admin") return { error: "Admins only." };
  if (studentId === me.id) return { error: "You cannot delete your own account." };

  const target = await getProfileById(studentId);
  if (!target) return { error: "Account not found." };
  if (target.role !== "student") {
    return { error: "Only student accounts can be deleted here." };
  }

  if (confirmation.trim() !== studentId) {
    return { error: "Confirmation does not match the account ID." };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Account deletion is not configured on this deployment." };
  }

  const core = await deleteAccountAndAssets(admin, studentId);
  if (core.error) return { error: core.error };

  revalidatePath("/", "layout");
  revalidatePath("/admin/students");
  revalidatePath("/dashboard");

  return { ok: true };
}

export interface EducatorAdminActionState {
  error?: string;
}

/**
 * Shared guard for the tier/verified admin controls. Confirms the caller is an admin and the TARGET
 * is an educator-capable row (educator or admin) — never a student — mirroring
 * ensureAdminEditingEducator in app/actions/educator-profile.ts (that one is module-private, so the
 * check is re-stated here). Returns an error state, or null when allowed.
 */
async function ensureAdminManagingEducator(
  educatorId: string,
): Promise<EducatorAdminActionState | null> {
  const me = await getCurrentProfile();
  if (!me) return { error: "Sign in required." };
  if (me.role !== "admin") return { error: "Admins only." };
  const target = await getProfileById(educatorId);
  if (!target) return { error: "Educator not found." };
  if (target.role !== "educator" && target.role !== "admin") {
    return { error: "Tier and verification only apply to educator accounts." };
  }
  return null;
}

/**
 * The set_educator_tier / set_educator_verified RPCs RAISE 'Educator profile % not found' when the
 * educator has no educator_profiles row (profile-state "none"). An admin may INSERT a bare sidecar
 * row via the educator_profiles_insert_admin RLS policy (protect_educator_admin_fields
 * early-returns for admins, and column defaults are all safe), so materialise it first.
 * ignoreDuplicates makes this a no-op when the row already exists — existing content is never
 * touched.
 */
async function ensureEducatorProfileRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  educatorId: string,
): Promise<EducatorAdminActionState | null> {
  const { error } = await supabase
    .from("educator_profiles")
    .upsert({ educator_id: educatorId }, { onConflict: "educator_id", ignoreDuplicates: true });
  if (error) return { error: "Could not prepare the educator's profile record." };
  return null;
}

/**
 * Tier/verified flips can change the public marketplace surfaces too: list_published_educators
 * orders premium-first, and the verified badge only renders publicly for premium educators.
 */
function revalidateEducatorSurfaces(educatorId: string): void {
  revalidatePath(`/admin/educators/${educatorId}`);
  revalidatePath("/admin/educators");
  revalidatePath("/educators");
  revalidatePath(`/educators/${educatorId}`);
}

/** Admin sets an educator's commercial tier via the set_educator_tier RPC (admin-enforced in SQL). */
export async function setEducatorTierAction(
  educatorId: string,
  tier: EducatorTier,
): Promise<EducatorAdminActionState> {
  if (tier !== "basic" && tier !== "premium") return { error: "Unknown tier." };

  const denied = await ensureAdminManagingEducator(educatorId);
  if (denied) return denied;

  const supabase = await createClient();
  const prep = await ensureEducatorProfileRow(supabase, educatorId);
  if (prep) return prep;

  const { error } = await supabase.rpc("set_educator_tier", {
    p_educator_id: educatorId,
    p_tier: tier,
  });
  if (error) return { error: "Tier could not be updated." };

  revalidateEducatorSurfaces(educatorId);
  return {};
}

/** Admin flips the verified badge via the set_educator_verified RPC (stamps/clears verified_by/_at). */
export async function setEducatorVerifiedAction(
  educatorId: string,
  verified: boolean,
): Promise<EducatorAdminActionState> {
  const denied = await ensureAdminManagingEducator(educatorId);
  if (denied) return denied;

  const supabase = await createClient();
  const prep = await ensureEducatorProfileRow(supabase, educatorId);
  if (prep) return prep;

  const { error } = await supabase.rpc("set_educator_verified", {
    p_educator_id: educatorId,
    p_verified: verified,
  });
  if (error) return { error: "Verification could not be updated." };

  revalidateEducatorSurfaces(educatorId);
  return {};
}
