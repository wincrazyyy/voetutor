"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorAccess } from "@/lib/tiers/gate";
import { createTusUpload, deleteVideo } from "@/lib/cloudflare/client";
import {
  type PlacementParent,
  parentColumns,
  parentKey,
  parentOf,
  resolveOwnedParentClass,
  nextPlacementOrder,
  classesForPlacementRows,
} from "@/lib/curriculum/placements";

const MAX_FILE_BYTES = 30 * 1024 * 1024 * 1024;
const MAX_DURATION_SECONDS = 4 * 60 * 60;

export interface CreateVideoUploadState {
  error?: string;
  ok?: boolean;
  uploadUrl?: string;
  videoId?: string;
  videoUid?: string;
}

export interface VideoActionState {
  error?: string;
  ok?: boolean;
}

/**
 * Origins allowed to embed the Stream player, read from a runtime server env
 * (comma-separated). Unlike NEXT_PUBLIC_* — which bakes in at build time and
 * only ever carried a single host — this lists every platform origin at once
 * (dev plus apex and www), so a video is never locked to just one of them.
 * Defaults to the known-good set; override with CLOUDFLARE_STREAM_ALLOWED_ORIGINS
 * (e.g. to add voe.com during the rebrand).
 */
function allowedPlaybackOrigins(): string[] {
  const raw =
    process.env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS ?? "localhost,voetutor.com,*.voetutor.com";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Mints a one-time Cloudflare upload URL and creates the matching `videos`
 * row in the `uploading` state. The browser then streams the file straight
 * to Cloudflare via tus — the API token never leaves the server. An optional
 * `parent` (topic or subtopic) also places the new video there.
 */
export async function createVideoUploadAction(input: {
  parent?: PlacementParent | null;
  title: string;
  description: string;
  fileSizeBytes: number;
}): Promise<CreateVideoUploadState> {
  const access = await getEducatorAccess();
  if (!access.profile) return { error: "Sign in required." };
  const { profile, isPremium } = access;
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can upload videos." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }
  if (!isPremium) {
    return { error: "Video uploads are a premium feature. Upgrade to add videos." };
  }

  const title = input.title.trim();
  if (!title) return { error: "A video title is required." };
  if (title.length > 255) return { error: "Title must be 255 characters or fewer." };

  const description = input.description.trim();
  if (description.length > 5000) return { error: "Description must be 5000 characters or fewer." };

  const fileSizeBytes = Math.floor(input.fileSizeBytes);
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return { error: "Select a valid video file." };
  }
  if (fileSizeBytes > MAX_FILE_BYTES) {
    return { error: "Video file exceeds the 30 GB limit." };
  }

  const supabase = await createClient();

  /* A parent is optional: portal uploads land in the library unplaced, while
     curriculum uploads place the new video straight into a topic/subtopic. When
     given, verify ownership of the containing class and compute the order. */
  const parent = input.parent ?? null;
  let classId: string | null = null;
  let orderIndex = 0;
  if (parent) {
    const resolved = await resolveOwnedParentClass(supabase, profile, parent);
    if ("error" in resolved) return { error: resolved.error };
    classId = resolved.classId;
    orderIndex = await nextPlacementOrder(supabase, parent);
  }

  const allowedOrigins = allowedPlaybackOrigins();
  let upload;
  try {
    upload = await createTusUpload({
      uploadLength: fileSizeBytes,
      name: title,
      maxDurationSeconds: MAX_DURATION_SECONDS,
      allowedOrigins: allowedOrigins.length ? allowedOrigins : undefined,
    });
  } catch {
    return { error: "Could not start the upload. Please try again." };
  }

  /* Create the library video (owned by the uploader). When a parent was given,
     also place it there; both rows — and the Cloudflare upload — roll back if
     the placement insert fails, so a failure never leaves an orphan. */
  const { data: inserted, error: videoError } = await supabase
    .from("videos")
    .insert({
      owner_id: profile.id,
      title,
      description: description || null,
      cloudflare_uid: upload.uid,
      status: "uploading",
    })
    .select("id")
    .single();

  if (videoError || !inserted) {
    await deleteVideo(upload.uid).catch(() => undefined);
    return { error: videoError?.message ?? "Could not create the video." };
  }
  const videoId = (inserted as { id: string }).id;

  if (parent) {
    const { error: placementError } = await supabase
      .from("video_placements")
      .insert({ video_id: videoId, ...parentColumns(parent), order_index: orderIndex });

    if (placementError) {
      await supabase.from("videos").delete().eq("id", videoId);
      await deleteVideo(upload.uid).catch(() => undefined);
      return { error: placementError.message };
    }
  }

  if (classId) revalidatePath(`/class/${classId}`);
  revalidatePath("/library");
  return {
    ok: true,
    uploadUrl: upload.uploadUrl,
    videoId,
    videoUid: upload.uid,
  };
}

/**
 * Deletes a video row and its Cloudflare counterpart. Used to clean up an
 * abandoned or failed upload, and as a general "remove video" affordance.
 */
export async function deleteVideoAction(videoId: string): Promise<VideoActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can delete videos." };
  }

  const supabase = await createClient();

  const { data: video } = await supabase
    .from("videos")
    .select("cloudflare_uid, owner_id")
    .eq("id", videoId)
    .maybeSingle();

  const videoRow = video as { cloudflare_uid: string | null; owner_id: string } | null;
  if (!videoRow) return { error: "Video not found." };

  if (profile.role !== "admin" && videoRow.owner_id !== profile.id) {
    return { error: "You don't have permission to delete this video." };
  }

  /* Capture the classes the video appears in before deleting, so their
     curriculum pages can be revalidated once the cascade removes placements. */
  const { data: placementRows } = await supabase
    .from("video_placements")
    .select("topic_id, subtopic_id")
    .eq("video_id", videoId);
  const classMap = await classesForPlacementRows(supabase, (placementRows ?? []) as Array<{
    topic_id: string | null;
    subtopic_id: string | null;
  }>);
  const classIds = [...new Set(classMap.values())];

  const { error } = await supabase.from("videos").delete().eq("id", videoId);
  if (error) return { error: error.message };

  if (videoRow.cloudflare_uid) {
    await deleteVideo(videoRow.cloudflare_uid).catch(() => undefined);
  }

  for (const id of classIds) revalidatePath(`/class/${id}`);
  revalidatePath("/library");
  return { ok: true };
}

/**
 * Reconciles a library video's placements to exactly the given set of parents
 * (topics and/or subtopics) — the core write behind the portal's "assign to
 * classes" picker, including overlap (the same video placed across two classes).
 * Parents are added/removed to match; an existing placement is left untouched.
 * Every requested parent is validated to a class the caller owns (RLS is the
 * backstop). When a class loses the video entirely, its dependent video_qa posts
 * are deleted first so the removal can't orphan Q&A referencing a video no longer
 * in that class.
 */
export async function setVideoPlacementsAction(
  videoId: string,
  parents: PlacementParent[],
): Promise<VideoActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can manage video placements." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }

  const supabase = await createClient();

  const { data: video } = await supabase
    .from("videos")
    .select("owner_id")
    .eq("id", videoId)
    .maybeSingle();
  const videoRow = video as { owner_id: string } | null;
  if (!videoRow) return { error: "Video not found." };
  if (profile.role !== "admin" && videoRow.owner_id !== profile.id) {
    return { error: "You don't have permission to manage this video." };
  }

  /* Dedupe requested parents by key. */
  const requested = new Map<string, PlacementParent>();
  for (const p of parents) requested.set(parentKey(p), p);

  /* Resolve every requested parent to an owned class; reject the whole request
     if any parent is missing or not the caller's. */
  const finalClasses = new Set<string>();
  for (const p of requested.values()) {
    const resolved = await resolveOwnedParentClass(supabase, profile, p);
    if ("error" in resolved) return { error: resolved.error };
    finalClasses.add(resolved.classId);
  }

  const { data: existing } = await supabase
    .from("video_placements")
    .select("id, topic_id, subtopic_id")
    .eq("video_id", videoId);
  const existingRows = (existing ?? []) as Array<{
    id: string;
    topic_id: string | null;
    subtopic_id: string | null;
  }>;

  const existingByKey = new Map<string, string>();
  for (const row of existingRows) {
    const p = parentOf(row);
    if (p) existingByKey.set(parentKey(p), row.id);
  }

  const toAdd = [...requested.values()].filter((p) => !existingByKey.has(parentKey(p)));
  const removeIds = [...existingByKey.entries()]
    .filter(([key]) => !requested.has(key))
    .map(([, id]) => id);

  const currentClassMap = await classesForPlacementRows(supabase, existingRows);
  const currentClasses = new Set(currentClassMap.values());

  /* Delete orphaned Q&A in classes that lose the video before removing any
     placement (placement deletes aren't trigger-guarded — the cleanup is ours). */
  for (const classId of currentClasses) {
    if (finalClasses.has(classId)) continue;
    const { error } = await supabase
      .from("forum_posts")
      .delete()
      .eq("video_id", videoId)
      .eq("class_id", classId);
    if (error) return { error: error.message };
  }

  if (removeIds.length > 0) {
    const { error } = await supabase.from("video_placements").delete().in("id", removeIds);
    if (error) return { error: error.message };
  }

  for (const parent of toAdd) {
    const orderIndex = await nextPlacementOrder(supabase, parent);
    const { error } = await supabase
      .from("video_placements")
      .insert({ video_id: videoId, ...parentColumns(parent), order_index: orderIndex });
    if (error) return { error: error.message };
  }

  for (const classId of new Set([...currentClasses, ...finalClasses])) {
    revalidatePath(`/class/${classId}`);
  }
  revalidatePath("/library");
  return { ok: true };
}

/**
 * Adds existing library videos into one parent (topic or subtopic) — the
 * curriculum board's "Add videos" picker. Additive (unlike setVideoPlacements,
 * which reconciles a single video's whole placement set): each selected video
 * gets a new placement under this parent, appended after the current contents,
 * while its placements elsewhere are untouched. Videos already under the parent
 * are skipped. Every video must be owned by the caller and the parent must
 * belong to a class they own.
 */
export async function addVideosToParentAction(
  classId: string,
  parent: PlacementParent,
  videoIds: string[],
): Promise<VideoActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can manage video placements." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }

  const ids = [...new Set(videoIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true };

  const supabase = await createClient();

  const resolved = await resolveOwnedParentClass(supabase, profile, parent);
  if ("error" in resolved) return { error: resolved.error };
  if (resolved.classId !== classId) return { error: "That node is not in this class." };

  const { data: owned } = await supabase.from("videos").select("id, owner_id").in("id", ids);
  const ownedRows = (owned ?? []) as Array<{ id: string; owner_id: string }>;
  const ownedIds = new Set(
    ownedRows
      .filter((row) => profile.role === "admin" || row.owner_id === profile.id)
      .map((row) => row.id),
  );
  if (ids.some((id) => !ownedIds.has(id))) {
    return { error: "You can only add videos from your own library." };
  }

  const column = parent.kind === "topic" ? "topic_id" : "subtopic_id";
  const { data: existing } = await supabase
    .from("video_placements")
    .select("video_id, order_index")
    .eq(column, parent.id);
  const existingRows = (existing ?? []) as Array<{ video_id: string; order_index: number }>;
  const alreadyPlaced = new Set(existingRows.map((row) => row.video_id));
  let nextOrder = existingRows.reduce((max, row) => Math.max(max, row.order_index), -1) + 1;

  const toInsert = ids
    .filter((id) => !alreadyPlaced.has(id))
    .map((id) => ({ video_id: id, ...parentColumns(parent), order_index: nextOrder++ }));
  if (toInsert.length === 0) return { ok: true };

  const { error } = await supabase.from("video_placements").insert(toInsert);
  if (error) {
    if (error.code === "23505") {
      return { error: "One or more of those videos are already here." };
    }
    return { error: error.message };
  }

  revalidatePath(`/class/${classId}`);
  revalidatePath("/library");
  return { ok: true };
}

/**
 * Removes one placement — "remove this video from this topic/subtopic" — without
 * deleting the underlying library video. If the placement is the video's last one
 * in its class, the class's dependent video_qa posts are deleted first so the
 * removal can't orphan Q&A.
 */
export async function unplaceVideoAction(placementId: string): Promise<VideoActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can manage video placements." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }

  const supabase = await createClient();

  const { data: placement } = await supabase
    .from("video_placements")
    .select("id, video_id, topic_id, subtopic_id")
    .eq("id", placementId)
    .maybeSingle();
  const row = placement as
    | { id: string; video_id: string; topic_id: string | null; subtopic_id: string | null }
    | null;
  if (!row) return { error: "Placement not found." };

  const parent = parentOf(row);
  if (!parent) return { error: "Placement is malformed." };
  const resolved = await resolveOwnedParentClass(supabase, profile, parent);
  if ("error" in resolved) return { error: resolved.error };
  const classId = resolved.classId;

  /* If the video has no other placement in this class, its Q&A here is about to
     be orphaned — delete it before removing the last placement. */
  const { data: siblings } = await supabase
    .from("video_placements")
    .select("id, topic_id, subtopic_id")
    .eq("video_id", row.video_id)
    .neq("id", placementId);
  const siblingClassMap = await classesForPlacementRows(
    supabase,
    (siblings ?? []) as Array<{ topic_id: string | null; subtopic_id: string | null }>,
  );
  const stillInClass = [...siblingClassMap.values()].includes(classId);

  if (!stillInClass) {
    const { error } = await supabase
      .from("forum_posts")
      .delete()
      .eq("video_id", row.video_id)
      .eq("class_id", classId);
    if (error) return { error: error.message };
  }

  const { error } = await supabase.from("video_placements").delete().eq("id", placementId);
  if (error) return { error: error.message };

  revalidatePath(`/class/${classId}`);
  revalidatePath("/library");
  return { ok: true };
}
