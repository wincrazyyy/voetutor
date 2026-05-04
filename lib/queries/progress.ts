import { createClient } from "@/lib/supabase/server";
import { intervalToSeconds } from "@/lib/utils/format";

export interface ContinueWatchingItem {
  video_id: string;
  video_title: string;
  subtopic_title: string;
  topic_title: string;
  class_id: string;
  class_code: string;
  class_title: string;
  duration: string | null;
  last_position: string;
  total_watch_time: string;
  remaining_seconds: number;
  updated_at: string;
}

export async function getContinueWatching(userId: string, limit = 1): Promise<ContinueWatchingItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_video_progress")
    .select(
      "video_id, last_position, total_watch_time, updated_at, is_completed, videos!inner(id, title, duration, subtopics!inner(id, title, topics!inner(id, title, classes!inner(id, code, title))))",
    )
    .eq("user_id", userId)
    .eq("is_completed", false)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((row) => {
    const r = row as unknown as {
      video_id: string;
      last_position: string;
      total_watch_time: string;
      updated_at: string;
      videos: {
        id: string;
        title: string;
        duration: string | null;
        subtopics: {
          id: string;
          title: string;
          topics: {
            id: string;
            title: string;
            classes: { id: string; code: string; title: string };
          };
        };
      };
    };
    const positionSec = intervalToSeconds(r.last_position);
    const durationSec = intervalToSeconds(r.videos.duration);
    return {
      video_id: r.video_id,
      video_title: r.videos.title,
      subtopic_title: r.videos.subtopics.title,
      topic_title: r.videos.subtopics.topics.title,
      class_id: r.videos.subtopics.topics.classes.id,
      class_code: r.videos.subtopics.topics.classes.code,
      class_title: r.videos.subtopics.topics.classes.title,
      duration: r.videos.duration,
      last_position: r.last_position,
      total_watch_time: r.total_watch_time,
      remaining_seconds: Math.max(0, durationSec - positionSec),
      updated_at: r.updated_at,
    };
  });
}

export interface DashboardStats {
  videos_watched: number;
  videos_total: number;
  weekly_watch_seconds: number;
  weekly_delta_seconds: number;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("class_id")
    .eq("user_id", userId);
  const classIds = (enrollments ?? []).map((e) => (e as { class_id: string }).class_id);

  let videosTotal = 0;
  if (classIds.length > 0) {
    const { count } = await supabase
      .from("videos")
      .select("id, subtopics!inner(topics!inner(class_id))", { count: "exact", head: true })
      .in("subtopics.topics.class_id", classIds);
    videosTotal = count ?? 0;
  }

  const { count: watchedCount } = await supabase
    .from("user_video_progress")
    .select("video_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_completed", true);

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();

  const { data: thisWeekRows } = await supabase
    .from("user_video_progress")
    .select("total_watch_time, updated_at")
    .eq("user_id", userId)
    .gte("updated_at", sevenDaysAgo);

  const { data: lastWeekRows } = await supabase
    .from("user_video_progress")
    .select("total_watch_time, updated_at")
    .eq("user_id", userId)
    .gte("updated_at", fourteenDaysAgo)
    .lt("updated_at", sevenDaysAgo);

  const sumWatch = (rows: Array<{ total_watch_time: string }> | null) =>
    (rows ?? []).reduce((acc, r) => acc + intervalToSeconds(r.total_watch_time), 0);

  const thisWeek = sumWatch(thisWeekRows as Array<{ total_watch_time: string }> | null);
  const lastWeek = sumWatch(lastWeekRows as Array<{ total_watch_time: string }> | null);

  return {
    videos_watched: watchedCount ?? 0,
    videos_total: videosTotal,
    weekly_watch_seconds: thisWeek,
    weekly_delta_seconds: thisWeek - lastWeek,
  };
}
