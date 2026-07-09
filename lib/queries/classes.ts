import { createClient } from "@/lib/supabase/server";
import { classNodeIds, placementsUnderClassFilter } from "@/lib/curriculum/placements";
import { getDisplayName } from "@/lib/utils/format";
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
    .select(
      "class_id, classes(id, code, title, description, educator_id, price_cents, currency, is_published, published_at, created_at, updated_at)",
    )
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

/**
 * Reads the caller's saved sidebar class ordering (class_id → zero-based position). Consumed only by
 * components/layout/sidebar.tsx to sort the class list; classes without a row are ordered after the
 * saved ones in their natural order. Not applied inside getEnrolledClasses / getClassesForEducator so
 * the marketplace and other consumers stay unaffected.
 */
export async function getClassOrder(userId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_class_order")
    .select("class_id, position")
    .eq("user_id", userId);

  const order = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ class_id: string; position: number }>) {
    order.set(row.class_id, row.position);
  }
  return order;
}

export async function getClassById(classId: string): Promise<Class | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select(
      "id, code, title, description, educator_id, price_cents, currency, is_published, published_at, created_at, updated_at",
    )
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

export interface RosterStudent {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * Enrolled students of a class for the educator/admin "Students" roster tab. The class-educator read
 * of class_enrollments is authorised by enrollments_select_authorized; names + avatars come from
 * profiles_public per the cross-user-read convention. Sorted by display name for a stable roster.
 */
export async function getClassRoster(classId: string): Promise<RosterStudent[]> {
  const supabase = await createClient();
  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select("user_id")
    .eq("class_id", classId);

  const userIds = ((enrollments ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
  if (userIds.length === 0) return [];

  const { data } = await supabase
    .from("profiles_public")
    .select("id, first_name, last_name, display_name, avatar_url")
    .in("id", userIds);

  const rows = (data ?? []) as RosterStudent[];
  rows.sort((a, b) =>
    getDisplayName(a.first_name, a.last_name, a.display_name).localeCompare(
      getDisplayName(b.first_name, b.last_name, b.display_name),
    ),
  );
  return rows;
}

export interface EducatorClassOption {
  id: string;
  title: string;
  code: string;
}

/**
 * Lightweight id/title/code list of an educator's classes, for the roster "Move to" picker. Avoids
 * getClassesForEducator's per-class aggregate counts (enrolment/topic/video/forum), which that picker
 * discards.
 */
export async function getEducatorClassOptions(educatorId: string): Promise<EducatorClassOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("id, title, code")
    .eq("educator_id", educatorId)
    .order("created_at", { ascending: false });
  return (data ?? []) as EducatorClassOption[];
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

  const { topicIds, subtopicIds } = await classNodeIds(supabase, classId);
  const orFilter = placementsUnderClassFilter(topicIds, subtopicIds);

  let placementRows: Array<{ video_id: string }> = [];
  if (orFilter) {
    const { data } = await supabase.from("video_placements").select("video_id").or(orFilter);
    placementRows = (data ?? []) as Array<{ video_id: string }>;
  }

  const videoIds = [...new Set(placementRows.map((row) => row.video_id))];
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
