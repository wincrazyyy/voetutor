import { createClient } from "@/lib/supabase/server";
import type { Class, ProfilePublic } from "@/lib/types/database";

export interface EnrolledClassSummary {
  id: string;
  code: string;
  title: string;
  educator_id: string | null;
  total_videos: number;
  watched_videos: number;
  progress_percent: number;
}

export async function getEnrolledClasses(userId: string): Promise<EnrolledClassSummary[]> {
  const supabase = await createClient();
  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("class_id, classes(id, code, title, educator_id)")
    .eq("user_id", userId);

  if (!enrollments) return [];

  const classRows = enrollments
    .map((e) => (e as unknown as { classes: Class }).classes)
    .filter((c): c is Class => Boolean(c));

  const summaries = await Promise.all(
    classRows.map(async (cls) => {
      const totals = await getClassVideoTotals(cls.id, userId);
      return {
        id: cls.id,
        code: cls.code,
        title: cls.title,
        educator_id: cls.educator_id,
        total_videos: totals.total_videos,
        watched_videos: totals.watched_videos,
        progress_percent: totals.progress_percent,
      };
    }),
  );

  return summaries;
}

export async function getClassById(classId: string): Promise<Class | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("id, code, title, educator_id, created_at, updated_at")
    .eq("id", classId)
    .maybeSingle();
  return (data as Class | null) ?? null;
}

export async function getClassEducator(educatorId: string | null): Promise<ProfilePublic | null> {
  if (!educatorId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles_public")
    .select("id, first_name, last_name, display_name, role, is_approved")
    .eq("id", educatorId)
    .maybeSingle();
  return (data as ProfilePublic | null) ?? null;
}

export async function getClassMemberCount(classId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("class_enrollments")
    .select("user_id", { count: "exact", head: true })
    .eq("class_id", classId);
  return count ?? 0;
}

export async function getClassVideoTotals(
  classId: string,
  userId: string,
): Promise<{ total_videos: number; watched_videos: number; progress_percent: number }> {
  const supabase = await createClient();

  const { data: videoRows } = await supabase
    .from("videos")
    .select("id, subtopics!inner(topic_id, topics!inner(class_id))")
    .eq("subtopics.topics.class_id", classId);

  const videoIds = (videoRows ?? []).map((row) => (row as { id: string }).id);
  const total = videoIds.length;

  if (total === 0) {
    return { total_videos: 0, watched_videos: 0, progress_percent: 0 };
  }

  const { data: progressRows } = await supabase
    .from("user_video_progress")
    .select("video_id, is_completed")
    .eq("user_id", userId)
    .in("video_id", videoIds);

  const watched = (progressRows ?? []).filter((r) => (r as { is_completed: boolean }).is_completed).length;

  return {
    total_videos: total,
    watched_videos: watched,
    progress_percent: total === 0 ? 0 : Math.round((watched / total) * 100),
  };
}
