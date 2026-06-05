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

  const [placementRes, enrollRes] = await Promise.all([
    supabase
      .from("video_placements")
      .select("order_index, videos!inner(id, title), subtopics!inner(topics!inner(class_id))")
      .eq("subtopics.topics.class_id", classId)
      .order("order_index", { ascending: true }),
    supabase.from("class_enrollments").select("user_id").eq("class_id", classId),
  ]);

  const placementRows = (placementRes.data ?? []) as unknown as Array<{
    videos: { id: string; title: string };
  }>;
  const seen = new Set<string>();
  const videos: Array<{ id: string; title: string }> = [];
  for (const row of placementRows) {
    if (!seen.has(row.videos.id)) {
      seen.add(row.videos.id);
      videos.push({ id: row.videos.id, title: row.videos.title });
    }
  }
  if (videos.length === 0) return [];

  const rosterIds = ((enrollRes.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  const videoIds = videos.map((video) => video.id);

  /* Roster attribution: progress is shared across classes for a shared video,
     so we restrict the rollup to this class's enrolled students. A viewer in
     another class never inflates these per-class numbers. */
  let progressRows: Array<{ video_id: string; is_completed: boolean; total_watch_time: string | null }> = [];
  if (rosterIds.length > 0) {
    const { data } = await supabase
      .from("user_video_progress")
      .select("video_id, is_completed, total_watch_time")
      .in("video_id", videoIds)
      .in("user_id", rosterIds);
    progressRows = (data ?? []) as Array<{
      video_id: string;
      is_completed: boolean;
      total_watch_time: string | null;
    }>;
  }

  const watchSecondsByVideo = new Map<string, number>();
  const completionsByVideo = new Map<string, number>();
  for (const row of progressRows) {
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
