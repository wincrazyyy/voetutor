import { createClient } from "@/lib/supabase/server";
import { intervalToSeconds } from "@/lib/utils/format";
import type { Class } from "@/lib/types/database";

export interface EducatorClassSummary extends Class {
  student_count: number;
  topic_count: number;
  video_count: number;
  unanswered_post_count: number;
}

export async function getClassesForEducator(educatorId: string): Promise<EducatorClassSummary[]> {
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select("id, code, title, educator_id, created_at, updated_at")
    .eq("educator_id", educatorId)
    .order("created_at", { ascending: false });

  if (!classes) return [];

  return Promise.all(
    classes.map(async (cls) => {
      const c = cls as Class;
      const [students, topics, videos, posts] = await Promise.all([
        supabase.from("class_enrollments").select("user_id", { count: "exact", head: true }).eq("class_id", c.id),
        supabase.from("topics").select("id", { count: "exact", head: true }).eq("class_id", c.id),
        supabase
          .from("videos")
          .select("id, subtopics!inner(topics!inner(class_id))", { count: "exact", head: true })
          .eq("subtopics.topics.class_id", c.id),
        supabase
          .from("forum_posts")
          .select("id", { count: "exact", head: true })
          .eq("class_id", c.id)
          .eq("is_resolved", false),
      ]);
      return {
        ...c,
        student_count: students.count ?? 0,
        topic_count: topics.count ?? 0,
        video_count: videos.count ?? 0,
        unanswered_post_count: posts.count ?? 0,
      };
    }),
  );
}

export interface EducatorClassStats {
  total_students: number;
  total_videos: number;
  total_completions: number;
  average_completion_rate: number;
  total_watch_seconds: number;
  unanswered_posts: number;
}

export async function getEducatorClassStats(classId: string): Promise<EducatorClassStats> {
  const supabase = await createClient();

  const [{ count: studentCount }, videoRowsRes, postRes] = await Promise.all([
    supabase.from("class_enrollments").select("user_id", { count: "exact", head: true }).eq("class_id", classId),
    supabase
      .from("videos")
      .select("id, subtopics!inner(topics!inner(class_id))")
      .eq("subtopics.topics.class_id", classId),
    supabase
      .from("forum_posts")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId)
      .eq("is_resolved", false),
  ]);

  const videoIds = ((videoRowsRes.data ?? []) as Array<{ id: string }>).map((v) => v.id);
  const totalVideos = videoIds.length;

  let completions = 0;
  let watchSeconds = 0;
  if (videoIds.length > 0) {
    const { data: progress } = await supabase
      .from("user_video_progress")
      .select("is_completed, total_watch_time")
      .in("video_id", videoIds);
    const rows = (progress ?? []) as Array<{ is_completed: boolean; total_watch_time: string }>;
    completions = rows.filter((r) => r.is_completed).length;
    watchSeconds = rows.reduce((acc, r) => acc + intervalToSeconds(r.total_watch_time), 0);
  }

  const denominator = (studentCount ?? 0) * totalVideos;
  const average = denominator === 0 ? 0 : Math.round((completions / denominator) * 100);

  return {
    total_students: studentCount ?? 0,
    total_videos: totalVideos,
    total_completions: completions,
    average_completion_rate: average,
    total_watch_seconds: watchSeconds,
    unanswered_posts: postRes.count ?? 0,
  };
}
