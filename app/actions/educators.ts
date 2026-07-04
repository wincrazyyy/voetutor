"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, getProfileById } from "@/lib/queries/profile";
import { deleteVideo } from "@/lib/cloudflare/client";

export interface DeleteEducatorState {
  error?: string;
  ok?: boolean;
}

/**
 * Every storage bucket keyed by the user's id as the first path segment: profile images, note PDFs,
 * and forum/announcement RTE images. The DB cascade never reaches Storage, so these are reaped
 * out-of-band. See lib/profile/asset-cleanup.ts (educator-assets), lib/storage/notes.ts
 * (class-resources), lib/forum/rte-image.ts (rte-images).
 */
const ASSET_BUCKETS = ["educator-assets", "class-resources", "rte-images"] as const;
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
 * Admin-only, irreversible deletion of an entire educator (or admin) account and EVERYTHING tied to
 * it — leaving no ghost rows or orphaned assets.
 *
 * The caller is authorized with the NORMAL user session FIRST (admin role + not self), exactly like
 * the other two sanctioned importers of the service-role client. Only then is the service-role admin
 * client constructed, because (a) profiles has no DELETE policy under FORCE RLS and (b) deleting the
 * auth.users row needs the auth admin API.
 *
 * Order matters:
 *  1. Capture the educator's Cloudflare video uids while the rows still exist (the FK cascade can't
 *     reach Cloudflare).
 *  2. Delete any verified reviews this user AUTHORED as a student (student_id) — inert in v1
 *     (imported-only), but pre-empts the chk_review_source_shape landmine: an ON DELETE SET NULL on
 *     educator_reviews.student_id would otherwise violate the CHECK and abort the whole delete once
 *     the verified-review path ships.
 *  3. Delete the educator's CLASSES while educator_id still matches — classes.educator_id is
 *     ON DELETE SET NULL, so the account delete alone would leave them as ownerless, still-published
 *     ghost classes. Each class DELETE cascades its topics/subtopics/placements/enrolments/
 *     announcements/forum threads/reports via class_id ON DELETE CASCADE.
 *  4. Hard-delete the auth user. profiles.id REFERENCES auth.users ON DELETE CASCADE, fanning out to
 *     educator_profiles, educator_reviews (about them), videos/resources rows, the user's own
 *     enrolments + progress, forum posts/replies/upvotes, announcements + reads, etc.
 *     shouldSoftDelete stays false (default) — a soft delete keeps auth.users, so the cascade never
 *     fires.
 *  5. Best-effort reap the external assets the cascade can't touch: Cloudflare videos + every
 *     storage bucket keyed by the user's id.
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

  /* 1. Capture Cloudflare uids before the videos rows cascade away. */
  const { data: videoRows } = await admin
    .from("videos")
    .select("cloudflare_uid")
    .eq("owner_id", educatorId);
  const cloudflareUids = ((videoRows ?? []) as Array<{ cloudflare_uid: string | null }>)
    .map((v) => v.cloudflare_uid)
    .filter((uid): uid is string => Boolean(uid));

  /* 2. Reviews this user authored as a student (future verified path; no-op in v1). This is the guard
        that pre-empts the chk_review_source_shape abort during the step-4 cascade, so surface its error
        rather than letting it resurface later as a confusing CHECK violation. */
  const { error: reviewError } = await admin
    .from("educator_reviews")
    .delete()
    .eq("student_id", educatorId);
  if (reviewError) {
    return { error: `Failed to delete the account's authored reviews: ${reviewError.message}` };
  }

  /* 3. Their classes (while educator_id still matches), cascading the whole class subtree. */
  const { error: classError } = await admin.from("classes").delete().eq("educator_id", educatorId);
  if (classError) {
    return { error: `Failed to delete the educator's classes: ${classError.message}` };
  }

  /* 4. The account itself — cascades the profile and everything owner-keyed off it. */
  const { error: deleteError } = await admin.auth.admin.deleteUser(educatorId);
  if (deleteError) {
    return { error: `Failed to delete the account: ${deleteError.message}` };
  }

  /* 5. External assets (best-effort; the account is already gone at this point). */
  for (const uid of cloudflareUids) {
    await deleteVideo(uid).catch(() => undefined);
  }
  for (const bucket of ASSET_BUCKETS) {
    await wipeStoragePrefix(admin, bucket, educatorId);
  }

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
