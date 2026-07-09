"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, getProfileById } from "@/lib/queries/profile";
import { deleteVideo } from "@/lib/cloudflare/client";
import { wipeNotePrefix } from "@/lib/storage/r2";

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
 * Admin-only, irreversible deletion of an entire educator (or admin) account and EVERYTHING tied to
 * it — leaving no ghost rows or orphaned assets.
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
  if (target.role !== "educator" && target.role !== "admin") {
    return { error: "Only educator or admin accounts can be deleted here." };
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
