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
  subtopicId: string;
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

  const { data: subtopic } = await supabase
    .from("subtopics")
    .select("id, topics!inner(class_id, classes!inner(educator_id))")
    .eq("id", input.subtopicId)
    .maybeSingle();

  const subtopicRow = subtopic as
    | { topics: { class_id: string; classes: { educator_id: string | null } } }
    | null;
  if (!subtopicRow) return { error: "Subtopic not found." };

  const classId = subtopicRow.topics.class_id;
  const ownsClass =
    profile.role === "admin" || subtopicRow.topics.classes.educator_id === profile.id;
  if (!ownsClass) {
    return { error: "You don't have permission to add videos to this class." };
  }

  const { data: lastPlacement } = await supabase
    .from("video_placements")
    .select("order_index")
    .eq("subtopic_id", input.subtopicId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orderIndex = ((lastPlacement as { order_index: number } | null)?.order_index ?? -1) + 1;

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

  /* Create the library video (owned by the uploader), then place it in the
     target subtopic. Both rows are rolled back — along with the Cloudflare
     upload — if either insert fails, so a failure never leaves an orphan. */
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

  const { error: placementError } = await supabase
    .from("video_placements")
    .insert({ video_id: videoId, subtopic_id: input.subtopicId, order_index: orderIndex });

  if (placementError) {
    await supabase.from("videos").delete().eq("id", videoId);
    await deleteVideo(upload.uid).catch(() => undefined);
    return { error: placementError.message };
  }

  revalidatePath(`/educator/classes/${classId}`);
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
  return { ok: true };
}
