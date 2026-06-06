"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";
import { createTusUpload, deleteVideo } from "@/lib/cloudflare/client";

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

/** The app's hostname, used to scope a video's allowed embedding origins. */
function appHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/**
 * Mints a one-time Cloudflare upload URL and creates the matching `videos`
 * row in the `uploading` state. The browser then streams the file straight
 * to Cloudflare via tus — the API token never leaves the server.
 */
export async function createVideoUploadAction(input: {
  subtopicId?: string | null;
  title: string;
  description: string;
  fileSizeBytes: number;
}): Promise<CreateVideoUploadState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can upload videos." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
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

  /* A subtopic is optional: portal uploads land in the library unplaced, while
     curriculum uploads place the new video straight into a subtopic. When given,
     verify ownership of the containing class and compute the placement order. */
  const subtopicId = input.subtopicId?.trim() || null;
  let classId: string | null = null;
  let orderIndex = 0;
  if (subtopicId) {
    const { data: subtopic } = await supabase
      .from("subtopics")
      .select("id, topics!inner(class_id, classes!inner(educator_id))")
      .eq("id", subtopicId)
      .maybeSingle();

    const subtopicRow = subtopic as
      | { topics: { class_id: string; classes: { educator_id: string | null } } }
      | null;
    if (!subtopicRow) return { error: "Subtopic not found." };

    classId = subtopicRow.topics.class_id;
    const ownsClass =
      profile.role === "admin" || subtopicRow.topics.classes.educator_id === profile.id;
    if (!ownsClass) {
      return { error: "You don't have permission to add videos to this class." };
    }

    const { data: lastPlacement } = await supabase
      .from("video_placements")
      .select("order_index")
      .eq("subtopic_id", subtopicId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    orderIndex = ((lastPlacement as { order_index: number } | null)?.order_index ?? -1) + 1;
  }

  const host = appHost();
  let upload;
  try {
    upload = await createTusUpload({
      uploadLength: fileSizeBytes,
      name: title,
      maxDurationSeconds: MAX_DURATION_SECONDS,
      allowedOrigins: host ? [host] : undefined,
    });
  } catch {
    return { error: "Could not start the upload. Please try again." };
  }

  /* Create the library video (owned by the uploader). When a subtopic was
     given, also place it there; both rows — and the Cloudflare upload — roll
     back if the placement insert fails, so a failure never leaves an orphan. */
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

  if (subtopicId) {
    const { error: placementError } = await supabase
      .from("video_placements")
      .insert({ video_id: videoId, subtopic_id: subtopicId, order_index: orderIndex });

    if (placementError) {
      await supabase.from("videos").delete().eq("id", videoId);
      await deleteVideo(upload.uid).catch(() => undefined);
      return { error: placementError.message };
    }
  }

  if (classId) revalidatePath(`/educator/classes/${classId}`);
  revalidatePath("/educator/videos");
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
    .select("subtopics!inner(topics!inner(class_id))")
    .eq("video_id", videoId);
  const classIds = [
    ...new Set(
      ((placementRows ?? []) as unknown as Array<{ subtopics: { topics: { class_id: string } } }>).map(
        (row) => row.subtopics.topics.class_id,
      ),
    ),
  ];

  const { error } = await supabase.from("videos").delete().eq("id", videoId);
  if (error) return { error: error.message };

  if (videoRow.cloudflare_uid) {
    await deleteVideo(videoRow.cloudflare_uid).catch(() => undefined);
  }

  for (const id of classIds) revalidatePath(`/educator/classes/${id}`);
  revalidatePath("/educator/videos");
  return { ok: true };
}

/**
 * Reconciles a library video's placements to exactly the given set of
 * subtopics — the core write behind the portal's "assign to classes" picker,
 * including overlap (the same video placed into subtopics across two classes).
 * Subtopics are added/removed to match; a video already placed in a subtopic is
 * left untouched. Every requested subtopic is validated to a class the caller
 * owns (RLS is the backstop). When a class loses the video entirely, its
 * dependent video_qa posts are deleted first so the placement removal can't
 * orphan Q&A that references a video no longer in that class.
 */
export async function setVideoPlacementsAction(
  videoId: string,
  subtopicIds: string[],
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

  const requested = [...new Set(subtopicIds.filter(Boolean))];

  /* Resolve every requested subtopic to its class and confirm the caller owns
     it. A length mismatch means a requested subtopic is hidden by RLS (not the
     caller's class) — reject the whole request rather than silently drop it. */
  const classBySubtopic = new Map<string, string>();
  if (requested.length > 0) {
    const { data: subs } = await supabase
      .from("subtopics")
      .select("id, topics!inner(class_id, classes!inner(educator_id))")
      .in("id", requested);
    const subRows = (subs ?? []) as unknown as Array<{
      id: string;
      topics: { class_id: string; classes: { educator_id: string | null } };
    }>;
    if (subRows.length !== requested.length) {
      return { error: "One or more selected subtopics could not be found." };
    }
    for (const row of subRows) {
      const owns = profile.role === "admin" || row.topics.classes.educator_id === profile.id;
      if (!owns) return { error: "You can only place videos into your own classes." };
      classBySubtopic.set(row.id, row.topics.class_id);
    }
  }

  const { data: existing } = await supabase
    .from("video_placements")
    .select("id, subtopic_id, subtopics!inner(topics!inner(class_id))")
    .eq("video_id", videoId);
  const existingRows = (existing ?? []) as unknown as Array<{
    id: string;
    subtopic_id: string;
    subtopics: { topics: { class_id: string } };
  }>;

  const existingSubtopicIds = new Set(existingRows.map((row) => row.subtopic_id));
  const requestedSet = new Set(requested);

  const toAdd = requested.filter((id) => !existingSubtopicIds.has(id));
  const removeIds = existingRows.filter((row) => !requestedSet.has(row.subtopic_id)).map((row) => row.id);

  const finalClasses = new Set<string>(requested.map((id) => classBySubtopic.get(id)!));
  const currentClasses = new Set(existingRows.map((row) => row.subtopics.topics.class_id));

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

  for (const subtopicId of toAdd) {
    const { data: last } = await supabase
      .from("video_placements")
      .select("order_index")
      .eq("subtopic_id", subtopicId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const orderIndex = ((last as { order_index: number } | null)?.order_index ?? -1) + 1;
    const { error } = await supabase
      .from("video_placements")
      .insert({ video_id: videoId, subtopic_id: subtopicId, order_index: orderIndex });
    if (error) return { error: error.message };
  }

  for (const classId of new Set([...currentClasses, ...finalClasses])) {
    revalidatePath(`/educator/classes/${classId}`);
  }
  revalidatePath("/educator/videos");
  return { ok: true };
}

/**
 * Removes one placement — "remove this video from this subtopic" — without
 * deleting the underlying library video. If the placement is the video's last
 * one in its class, the class's dependent video_qa posts are deleted first so
 * the removal can't orphan Q&A.
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
    .select("id, video_id, subtopics!inner(topics!inner(class_id, classes!inner(educator_id)))")
    .eq("id", placementId)
    .maybeSingle();
  const row = placement as
    | {
        id: string;
        video_id: string;
        subtopics: { topics: { class_id: string; classes: { educator_id: string | null } } };
      }
    | null;
  if (!row) return { error: "Placement not found." };

  const classId = row.subtopics.topics.class_id;
  const owns = profile.role === "admin" || row.subtopics.topics.classes.educator_id === profile.id;
  if (!owns) return { error: "You don't have permission to remove this video." };

  /* If the video has no other placement in this class, its Q&A here is about to
     be orphaned — delete it before removing the last placement. */
  const { data: siblings } = await supabase
    .from("video_placements")
    .select("id, subtopics!inner(topics!inner(class_id))")
    .eq("video_id", row.video_id)
    .neq("id", placementId);
  const stillInClass = (
    (siblings ?? []) as unknown as Array<{ subtopics: { topics: { class_id: string } } }>
  ).some((sibling) => sibling.subtopics.topics.class_id === classId);

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

  revalidatePath(`/educator/classes/${classId}`);
  revalidatePath("/educator/videos");
  return { ok: true };
}
