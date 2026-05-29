import { createClient } from "@/lib/supabase/server";

export interface VideoProgress {
  last_position: string;
  total_watch_time: string;
  is_completed: boolean;
}

/**
 * The caller's playback state for one video — drives resume position and
 * the initial "completed" state on the lesson page. Returns null when the
 * user has never opened the video.
 */
export async function getVideoProgress(
  userId: string,
  videoId: string,
): Promise<VideoProgress | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_video_progress")
    .select("last_position, total_watch_time, is_completed")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();
  return (data as VideoProgress | null) ?? null;
}
