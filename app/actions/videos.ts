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

  const { data: lastVideo } = await supabase
    .from("videos")
    .select("order_index")
    .eq("subtopic_id", input.subtopicId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orderIndex = ((lastVideo as { order_index: number } | null)?.order_index ?? -1) + 1;

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

  const { data: inserted, error } = await supabase
    .from("videos")
    .insert({
      subtopic_id: input.subtopicId,
      title,
      description: description || null,
      cloudflare_uid: upload.uid,
      status: "uploading",
      order_index: orderIndex,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    /* Roll back the Cloudflare upload so it does not linger as reserved storage. */
    await deleteVideo(upload.uid).catch(() => undefined);
    return { error: error?.message ?? "Could not create the video." };
  }

  revalidatePath(`/educator/classes/${classId}`);
  return {
    ok: true,
    uploadUrl: upload.uploadUrl,
    videoId: (inserted as { id: string }).id,
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
    .select("cloudflare_uid, subtopics!inner(topics!inner(class_id, classes!inner(educator_id)))")
    .eq("id", videoId)
    .maybeSingle();

  const videoRow = video as
    | {
        cloudflare_uid: string | null;
        subtopics: { topics: { class_id: string; classes: { educator_id: string | null } } };
      }
    | null;
  if (!videoRow) return { error: "Video not found." };

  const classId = videoRow.subtopics.topics.class_id;
  const ownsClass =
    profile.role === "admin" || videoRow.subtopics.topics.classes.educator_id === profile.id;
  if (!ownsClass) {
    return { error: "You don't have permission to delete this video." };
  }

  const { error } = await supabase.from("videos").delete().eq("id", videoId);
  if (error) return { error: error.message };

  if (videoRow.cloudflare_uid) {
    await deleteVideo(videoRow.cloudflare_uid).catch(() => undefined);
  }

  revalidatePath(`/educator/classes/${classId}`);
  return { ok: true };
}
