import { createClient } from "@/lib/supabase/server";
import { getDisplayName, intervalToSeconds } from "@/lib/utils/format";
import { placedVideoRowsForClass } from "@/lib/curriculum/placements";
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
    .select(
      "id, code, title, description, educator_id, price_cents, currency, is_published, published_at, created_at, updated_at",
    )
    .eq("educator_id", educatorId)
    .order("created_at", { ascending: false });

  if (!classes) return [];

  return Promise.all(
    classes.map(async (cls) => {
      const c = cls as Class;
      const [students, topics, videoRows, posts] = await Promise.all([
        supabase.from("class_enrollments").select("user_id", { count: "exact", head: true }).eq("class_id", c.id),
        supabase.from("topics").select("id", { count: "exact", head: true }).eq("class_id", c.id),
        placedVideoRowsForClass(supabase, c.id),
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
        video_count: new Set(videoRows.map((v) => v.id)).size,
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

  const [enrollRes, placedVideos, postRes] = await Promise.all([
    supabase.from("class_enrollments").select("user_id").eq("class_id", classId),
    placedVideoRowsForClass(supabase, classId),
    supabase
      .from("forum_posts")
      .select("id", { count: "exact", head: true })
      .eq("class_id", classId)
      .eq("is_resolved", false),
  ]);

  const rosterIds = ((enrollRes.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  const studentCount = rosterIds.length;
  const videoIds = [...new Set(placedVideos.map((r) => r.id))];
  const totalVideos = videoIds.length;

  let completions = 0;
  let watchSeconds = 0;
  /* Roster attribution: only this class's enrolled students count, so a shared
     video's watches in another class never leak into these numbers. */
  if (videoIds.length > 0 && rosterIds.length > 0) {
    const { data: progress } = await supabase
      .from("user_video_progress")
      .select("is_completed, total_watch_time")
      .in("video_id", videoIds)
      .in("user_id", rosterIds);
    const rows = (progress ?? []) as Array<{ is_completed: boolean; total_watch_time: string }>;
    completions = rows.filter((r) => r.is_completed).length;
    watchSeconds = rows.reduce((acc, r) => acc + intervalToSeconds(r.total_watch_time), 0);
  }

  const denominator = studentCount * totalVideos;
  const average = denominator === 0 ? 0 : Math.round((completions / denominator) * 100);

  return {
    total_students: studentCount,
    total_videos: totalVideos,
    total_completions: completions,
    average_completion_rate: average,
    total_watch_seconds: watchSeconds,
    unanswered_posts: postRes.count ?? 0,
  };
}

export interface StudentVideoProgress {
  video_id: string;
  title: string;
  started: boolean;
  is_completed: boolean;
  watch_seconds: number;
  last_position_seconds: number;
}

export interface StudentRosterEntry {
  user_id: string;
  name: string;
  total_videos: number;
  completed_count: number;
  started_count: number;
  total_watch_seconds: number;
}

export interface StudentRosterProgress {
  students: Array<StudentRosterEntry & { videos: StudentVideoProgress[] }>;
}

/**
 * Per-student progress roster for a class: every enrolled student with their
 * completion and watch-time totals plus a per-video breakdown. The educator's
 * read of other users' user_video_progress rows is authorised by the
 * progress_select_authorized RLS policy (class-educator branch). Student names
 * come from profiles_public per the cross-user-read convention.
 */
export async function getStudentRosterProgress(classId: string): Promise<StudentRosterProgress> {
  const supabase = await createClient();

  const [enrollRes, placedVideos] = await Promise.all([
    supabase.from("class_enrollments").select("user_id").eq("class_id", classId),
    placedVideoRowsForClass(supabase, classId),
  ]);

  const userIds = ((enrollRes.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  /* A shared video could be placed more than once in a class; show it once. */
  const seenVideo = new Set<string>();
  const videos: Array<{ id: string; title: string }> = [];
  for (const row of placedVideos) {
    if (!seenVideo.has(row.id)) {
      seenVideo.add(row.id);
      videos.push({ id: row.id, title: row.title });
    }
  }

  if (userIds.length === 0) return { students: [] };

  const videoIds = videos.map((v) => v.id);

  const [profilesRes, progressRes] = await Promise.all([
    supabase.from("profiles_public").select("id, first_name, last_name, display_name").in("id", userIds),
    videoIds.length > 0
      ? supabase
          .from("user_video_progress")
          .select("user_id, video_id, is_completed, total_watch_time, last_position")
          .in("video_id", videoIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const nameById = new Map<string, string>();
  for (const p of (profilesRes.data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
  }>) {
    nameById.set(p.id, getDisplayName(p.first_name, p.last_name, p.display_name));
  }

  const progressByUser = new Map<
    string,
    Map<string, { is_completed: boolean; watch_seconds: number; last_position_seconds: number }>
  >();
  for (const row of (progressRes.data ?? []) as Array<{
    user_id: string;
    video_id: string;
    is_completed: boolean;
    total_watch_time: string | null;
    last_position: string | null;
  }>) {
    let videoMap = progressByUser.get(row.user_id);
    if (!videoMap) {
      videoMap = new Map();
      progressByUser.set(row.user_id, videoMap);
    }
    videoMap.set(row.video_id, {
      is_completed: row.is_completed,
      watch_seconds: intervalToSeconds(row.total_watch_time),
      last_position_seconds: intervalToSeconds(row.last_position),
    });
  }

  const students = userIds.map((userId) => {
    const videoMap = progressByUser.get(userId);
    const videoRows: StudentVideoProgress[] = videos.map((v) => {
      const p = videoMap?.get(v.id);
      return {
        video_id: v.id,
        title: v.title,
        started: Boolean(p),
        is_completed: p?.is_completed ?? false,
        watch_seconds: p?.watch_seconds ?? 0,
        last_position_seconds: p?.last_position_seconds ?? 0,
      };
    });
    return {
      user_id: userId,
      name: nameById.get(userId) ?? "Unknown student",
      total_videos: videos.length,
      completed_count: videoRows.filter((v) => v.is_completed).length,
      started_count: videoRows.filter((v) => v.started).length,
      total_watch_seconds: videoRows.reduce((acc, v) => acc + v.watch_seconds, 0),
      videos: videoRows,
    };
  });

  students.sort((a, b) => a.name.localeCompare(b.name));

  return { students };
}
