import { createClient } from "@/lib/supabase/server";
import { intervalToSeconds } from "@/lib/utils/format";

export interface VideoAnalytics {
  videoId: string;
  title: string;
  minutesViewed: number;
  completions: number;
}

/**
 * Per-video analytics for a class, derived from user_video_progress:
 * minutesViewed is the summed watch time across all enrolled students
 * (reliable and immediate, unlike Cloudflare's delivery analytics which
 * report on a multi-hour delay); completions is the count of students who
 * finished the lesson. The educator's read of other users' progress rows is
 * authorised by the progress_select_authorized RLS policy.
 */
export async function getVideoAnalyticsForClass(classId: string): Promise<VideoAnalytics[]> {
  const supabase = await createClient();

  const { data: videoRows } = await supabase
    .from("videos")
    .select("id, title, order_index, subtopics!inner(topics!inner(class_id))")
    .eq("subtopics.topics.class_id", classId)
    .order("order_index", { ascending: true });

  const videos = ((videoRows ?? []) as unknown as Array<{ id: string; title: string }>).map((v) => ({
    id: v.id,
    title: v.title,
  }));
  if (videos.length === 0) return [];

  const videoIds = videos.map((video) => video.id);

  const { data: progressRows } = await supabase
    .from("user_video_progress")
    .select("video_id, is_completed, total_watch_time")
    .in("video_id", videoIds);

  const watchSecondsByVideo = new Map<string, number>();
  const completionsByVideo = new Map<string, number>();
  for (const row of (progressRows ?? []) as Array<{
    video_id: string;
    is_completed: boolean;
    total_watch_time: string | null;
  }>) {
    watchSecondsByVideo.set(
      row.video_id,
      (watchSecondsByVideo.get(row.video_id) ?? 0) + intervalToSeconds(row.total_watch_time),
    );
    if (row.is_completed) {
      completionsByVideo.set(row.video_id, (completionsByVideo.get(row.video_id) ?? 0) + 1);
    }
  }

  return videos.map((video) => ({
    videoId: video.id,
    title: video.title,
    minutesViewed: Math.round((watchSecondsByVideo.get(video.id) ?? 0) / 60),
    completions: completionsByVideo.get(video.id) ?? 0,
  }));
}
