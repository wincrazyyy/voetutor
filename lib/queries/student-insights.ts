import { createClient } from "@/lib/supabase/server";
import { getCurriculumForClass } from "@/lib/queries/curriculum";
import { getClassesForEducator } from "@/lib/queries/educator";
import { getDisplayName, intervalToSeconds } from "@/lib/utils/format";
import type { ClassPassItem, EnrollmentAccess, UserRole } from "@/lib/types/database";

/**
 * One enrolled student's profile + enrollment context for one class, as returned by the
 * get_class_student_detail SECURITY DEFINER RPC (the educator/admin read boundary — the RPC's
 * WHERE clause and column list are the authorization, not this wrapper).
 */
export interface StudentClassDetail {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  whatsapp_number: string | null;
  school: string | null;
  school_year: string | null;
  target_grade: string | null;
  account_created_at: string;
  enrolled_at: string;
  access_scope: EnrollmentAccess;
  enrolled_class_count: number;
}

/**
 * Wraps the get_class_student_detail RPC. Fails closed to null on BOTH the error case (the RPC
 * RAISEs for an unauthorized caller) and the empty case (target not enrolled / not a student), so
 * the page renders a clean 404 rather than a 500. The page guard redirects non-owning educators
 * before this runs — the RPC's RAISE is defense-in-depth.
 */
export async function getStudentClassDetail(
  classId: string,
  studentId: string,
): Promise<StudentClassDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_class_student_detail", {
    p_class_id: classId,
    p_student_id: studentId,
  });
  if (error) return null;
  const rows = (data ?? []) as StudentClassDetail[];
  return rows[0] ?? null;
}

export interface StudentVideoDetail {
  video_id: string;
  title: string;
  accessible: boolean;
  started: boolean;
  is_completed: boolean;
  completed_at: string | null;
  watch_seconds: number;
  last_position_seconds: number;
  last_watched_at: string | null;
  duration_seconds: number;
}

export interface StudentTopicDetail {
  topic_id: string;
  title: string;
  accessible_total: number;
  completed_count: number;
  watch_seconds: number;
  videos: StudentVideoDetail[];
}

export interface StudentClassProgress {
  topics: StudentTopicDetail[];
  accessible_total: number;
  completed_count: number;
  started_count: number;
  total_watch_seconds: number;
  accessible_watch_seconds: number;
  total_duration_seconds: number;
  completion_percent: number;
  first_activity_at: string | null;
  last_progress_at: string | null;
}

interface ProgressRow {
  video_id: string;
  is_completed: boolean;
  completed_at: string | null;
  total_watch_time: string | null;
  last_position: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * One student's per-topic / per-video progress across one class, in curriculum reading order.
 * The skeleton comes from getCurriculumForClass (called with the STUDENT's id — the educator's
 * read of the student's user_video_progress rows is authorized by progress_select_authorized);
 * a fuller progress query overlays completed_at / watch time / timestamps.
 *
 * Scope-aware, matching internal.scoped_placement_access exactly: for a `scoped` enrollment a
 * video is accessible when a held pass grants its parent topic (a topic grant covers topic-level
 * placements AND every subtopic under it), its exact subtopic, or the video itself; note grants
 * are ignored (notes carry no progress). Fail-closed: scoped with zero held passes ⇒ zero
 * accessible videos. Completion ratios use the ACCESSIBLE denominator (guarded — never NaN);
 * watch time counts real activity on any of the class's videos, in or out of scope.
 */
export async function getStudentClassProgress(
  classId: string,
  studentId: string,
): Promise<StudentClassProgress> {
  const supabase = await createClient();

  const [curriculum, enrollmentRes] = await Promise.all([
    getCurriculumForClass(classId, studentId),
    supabase
      .from("class_enrollments")
      .select("access_scope")
      .eq("class_id", classId)
      .eq("user_id", studentId)
      .maybeSingle(),
  ]);

  const scope: EnrollmentAccess =
    (enrollmentRes.data as { access_scope: EnrollmentAccess } | null)?.access_scope ?? "scoped";

  /* Grant sets for a scoped enrollment (empty for full — everything is accessible then). */
  const grantedTopics = new Set<string>();
  const grantedSubtopics = new Set<string>();
  const grantedVideos = new Set<string>();
  if (scope === "scoped") {
    const { data: holders } = await supabase
      .from("class_pass_holders")
      .select("pass_id")
      .eq("class_id", classId)
      .eq("user_id", studentId);
    const passIds = ((holders ?? []) as Array<{ pass_id: string }>).map((h) => h.pass_id);
    if (passIds.length > 0) {
      const { data: items } = await supabase
        .from("class_pass_items")
        .select("id, pass_id, topic_id, subtopic_id, video_id, resource_id, created_at")
        .in("pass_id", passIds);
      for (const item of (items ?? []) as ClassPassItem[]) {
        if (item.topic_id) grantedTopics.add(item.topic_id);
        else if (item.subtopic_id) grantedSubtopics.add(item.subtopic_id);
        else if (item.video_id) grantedVideos.add(item.video_id);
      }
    }
  }

  /* Every placement context a video has in THIS class — a library video can be placed in several
     nodes. Accessibility must consider ALL of them, matching internal.video_visible_in_class's
     "accessible if ANY placement is granted" rule; keying off only the first-occurrence placement
     would wrongly grey a video granted via a different node's pass. */
  const placementContexts = new Map<string, Array<{ topic_id: string; subtopic_id: string | null }>>();
  const recordContext = (videoId: string, topicId: string, subtopicId: string | null) => {
    const existing = placementContexts.get(videoId);
    if (existing) existing.push({ topic_id: topicId, subtopic_id: subtopicId });
    else placementContexts.set(videoId, [{ topic_id: topicId, subtopic_id: subtopicId }]);
  };

  /* Flatten the curriculum into reading order, deduping a video placed more than once in the
     class (first occurrence wins) so nothing is double-counted in the display. Every placement is
     still recorded above so accessibility sees the full picture. */
  interface SkeletonVideo {
    video_id: string;
    title: string;
    duration_seconds: number;
    topic_id: string;
    subtopic_id: string | null;
  }
  const seen = new Set<string>();
  const topicSkeletons: Array<{ topic_id: string; title: string; videos: SkeletonVideo[] }> = [];
  for (const topic of curriculum) {
    const videos: SkeletonVideo[] = [];
    for (const video of topic.videos) {
      recordContext(video.id, topic.id, null);
      if (seen.has(video.id)) continue;
      seen.add(video.id);
      videos.push({
        video_id: video.id,
        title: video.title,
        duration_seconds: intervalToSeconds(video.duration),
        topic_id: topic.id,
        subtopic_id: null,
      });
    }
    for (const subtopic of topic.subtopics) {
      for (const video of subtopic.videos) {
        recordContext(video.id, topic.id, subtopic.id);
        if (seen.has(video.id)) continue;
        seen.add(video.id);
        videos.push({
          video_id: video.id,
          title: video.title,
          duration_seconds: intervalToSeconds(video.duration),
          topic_id: topic.id,
          subtopic_id: subtopic.id,
        });
      }
    }
    if (videos.length > 0) {
      topicSkeletons.push({ topic_id: topic.id, title: topic.title, videos });
    }
  }

  /* A scoped video is accessible if ANY of its placements is granted: the placement's topic (a
     topic grant covers its topic-level placements AND every subtopic under it — ctx.topic_id is the
     parent topic for subtopic placements too), its exact subtopic, or a direct video grant. */
  const isAccessible = (videoId: string): boolean => {
    if (scope === "full") return true;
    if (grantedVideos.has(videoId)) return true;
    const contexts = placementContexts.get(videoId) ?? [];
    return contexts.some(
      (ctx) =>
        grantedTopics.has(ctx.topic_id) ||
        (ctx.subtopic_id !== null && grantedSubtopics.has(ctx.subtopic_id)),
    );
  };

  const videoIds = topicSkeletons.flatMap((t) => t.videos.map((v) => v.video_id));
  const progressMap = new Map<string, ProgressRow>();
  if (videoIds.length > 0) {
    const { data: progressRaw } = await supabase
      .from("user_video_progress")
      .select("video_id, is_completed, completed_at, total_watch_time, last_position, created_at, updated_at")
      .eq("user_id", studentId)
      .in("video_id", videoIds);
    for (const row of (progressRaw ?? []) as ProgressRow[]) {
      progressMap.set(row.video_id, row);
    }
  }

  let firstActivityAt: string | null = null;
  let lastProgressAt: string | null = null;
  for (const row of progressMap.values()) {
    if (!firstActivityAt || row.created_at < firstActivityAt) firstActivityAt = row.created_at;
    if (!lastProgressAt || row.updated_at > lastProgressAt) lastProgressAt = row.updated_at;
  }

  const topics: StudentTopicDetail[] = topicSkeletons.map((topic) => {
    const videos: StudentVideoDetail[] = topic.videos.map((v) => {
      const p = progressMap.get(v.video_id);
      return {
        video_id: v.video_id,
        title: v.title,
        accessible: isAccessible(v.video_id),
        started: Boolean(p),
        is_completed: p?.is_completed ?? false,
        completed_at: p?.completed_at ?? null,
        watch_seconds: intervalToSeconds(p?.total_watch_time ?? null),
        last_position_seconds: intervalToSeconds(p?.last_position ?? null),
        last_watched_at: p?.updated_at ?? null,
        duration_seconds: v.duration_seconds,
      };
    });
    const accessibleVideos = videos.filter((v) => v.accessible);
    return {
      topic_id: topic.topic_id,
      title: topic.title,
      accessible_total: accessibleVideos.length,
      completed_count: accessibleVideos.filter((v) => v.is_completed).length,
      watch_seconds: videos.reduce((acc, v) => acc + v.watch_seconds, 0),
      videos,
    };
  });

  const allVideos = topics.flatMap((t) => t.videos);
  const accessibleVideos = allVideos.filter((v) => v.accessible);
  const accessibleTotal = accessibleVideos.length;
  const completedCount = accessibleVideos.filter((v) => v.is_completed).length;

  return {
    topics,
    accessible_total: accessibleTotal,
    completed_count: completedCount,
    started_count: accessibleVideos.filter((v) => v.started).length,
    total_watch_seconds: allVideos.reduce((acc, v) => acc + v.watch_seconds, 0),
    accessible_watch_seconds: accessibleVideos.reduce((acc, v) => acc + v.watch_seconds, 0),
    total_duration_seconds: accessibleVideos.reduce((acc, v) => acc + v.duration_seconds, 0),
    completion_percent:
      accessibleTotal === 0 ? 0 : Math.round((completedCount / accessibleTotal) * 100),
    first_activity_at: firstActivityAt,
    last_progress_at: lastProgressAt,
  };
}

export interface StudentClassEngagement {
  posts_count: number;
  qa_posts_count: number;
  replies_count: number;
  upvotes_received: number;
  resolved_questions: number;
  last_forum_activity_at: string | null;
  announcements_visible: number;
  announcements_read: number;
  last_announcement_read_at: string | null;
}

/**
 * One student's forum + announcement engagement in one class. Forum reads ride the membership
 * perimeter policies; the announcement receipts read rides the NEW
 * announcement_reads_select_class_educator policy (admins pass via the self-or-admin policy).
 * The announcements denominator is what THIS student can see: broadcast rows (pass_id IS NULL)
 * plus rows targeted at a pass they hold. Ratios are denominator-guarded upstream in the UI.
 */
export async function getStudentClassEngagement(
  classId: string,
  studentId: string,
): Promise<StudentClassEngagement> {
  const supabase = await createClient();

  const [postsRes, repliesRes, announcementsRes, holdersRes] = await Promise.all([
    supabase
      .from("forum_posts")
      .select("id, type, upvotes, is_resolved, created_at")
      .eq("class_id", classId)
      .eq("author_id", studentId),
    supabase
      .from("forum_replies")
      .select("id, upvotes, is_deleted, created_at, forum_posts!inner(class_id)")
      .eq("author_id", studentId)
      .eq("forum_posts.class_id", classId),
    supabase.from("announcements").select("id, pass_id").eq("class_id", classId),
    supabase
      .from("class_pass_holders")
      .select("pass_id")
      .eq("class_id", classId)
      .eq("user_id", studentId),
  ]);

  const posts = (postsRes.data ?? []) as Array<{
    id: string;
    type: "general" | "video_qa";
    upvotes: number;
    is_resolved: boolean;
    created_at: string;
  }>;
  const replies = (repliesRes.data ?? []) as unknown as Array<{
    id: string;
    upvotes: number;
    is_deleted: boolean;
    created_at: string;
  }>;
  const liveReplies = replies.filter((r) => !r.is_deleted);

  let lastForumActivityAt: string | null = null;
  for (const row of [...posts, ...replies]) {
    if (!lastForumActivityAt || row.created_at > lastForumActivityAt) {
      lastForumActivityAt = row.created_at;
    }
  }

  const heldPassIds = new Set(
    ((holdersRes.data ?? []) as Array<{ pass_id: string }>).map((h) => h.pass_id),
  );
  const visibleAnnouncementIds = ((announcementsRes.data ?? []) as Array<{
    id: string;
    pass_id: string | null;
  }>)
    .filter((a) => a.pass_id === null || heldPassIds.has(a.pass_id))
    .map((a) => a.id);

  let announcementsRead = 0;
  let lastAnnouncementReadAt: string | null = null;
  if (visibleAnnouncementIds.length > 0) {
    const { data: reads } = await supabase
      .from("announcement_reads")
      .select("announcement_id, created_at")
      .eq("user_id", studentId)
      .in("announcement_id", visibleAnnouncementIds);
    const readRows = (reads ?? []) as Array<{ announcement_id: string; created_at: string }>;
    announcementsRead = readRows.length;
    for (const row of readRows) {
      if (!lastAnnouncementReadAt || row.created_at > lastAnnouncementReadAt) {
        lastAnnouncementReadAt = row.created_at;
      }
    }
  }

  return {
    posts_count: posts.length,
    qa_posts_count: posts.filter((p) => p.type === "video_qa").length,
    replies_count: liveReplies.length,
    upvotes_received:
      posts.reduce((acc, p) => acc + p.upvotes, 0) +
      liveReplies.reduce((acc, r) => acc + r.upvotes, 0),
    resolved_questions: posts.filter((p) => p.type === "video_qa" && p.is_resolved).length,
    last_forum_activity_at: lastForumActivityAt,
    announcements_visible: visibleAnnouncementIds.length,
    announcements_read: announcementsRead,
    last_announcement_read_at: lastAnnouncementReadAt,
  };
}

export interface EducatorStudentSummary {
  student_id: string;
  name: string;
  avatar_url: string | null;
  classes: Array<{ class_id: string; code: string; title: string }>;
}

/**
 * Every student across the classes the given educator teaches, DEDUPED — a student enrolled in
 * two of the viewer's classes appears once, carrying refs to both. Drives the top-level /students
 * hub. Names/avatars come from profiles_public (the cross-user-read convention); any non-student
 * enrollment row is dropped. The enrollment read is RLS-scoped to classes the caller teaches
 * (enrollments_select_authorized), so this can never see another educator's rosters. Admins own
 * no classes, so they get an empty list here (the hub's empty state points them at /admin/students).
 */
export async function getStudentsForEducator(educatorId: string): Promise<EducatorStudentSummary[]> {
  const classes = await getClassesForEducator(educatorId);
  if (classes.length === 0) return [];

  const supabase = await createClient();
  const { data: enrollRows } = await supabase
    .from("class_enrollments")
    .select("user_id, class_id")
    .in(
      "class_id",
      classes.map((c) => c.id),
    );
  const rows = (enrollRows ?? []) as Array<{ user_id: string; class_id: string }>;
  if (rows.length === 0) return [];

  const classIdsByStudent = new Map<string, Set<string>>();
  for (const row of rows) {
    let set = classIdsByStudent.get(row.user_id);
    if (!set) {
      set = new Set();
      classIdsByStudent.set(row.user_id, set);
    }
    set.add(row.class_id);
  }

  const { data: profileRows } = await supabase
    .from("profiles_public")
    .select("id, first_name, last_name, display_name, role, avatar_url")
    .in("id", [...classIdsByStudent.keys()]);

  const students: EducatorStudentSummary[] = [];
  for (const p of (profileRows ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    role: UserRole;
    avatar_url: string | null;
  }>) {
    if (p.role !== "student") continue;
    const memberOf = classIdsByStudent.get(p.id) ?? new Set<string>();
    students.push({
      student_id: p.id,
      name: getDisplayName(p.first_name, p.last_name, p.display_name),
      avatar_url: p.avatar_url,
      classes: classes
        .filter((c) => memberOf.has(c.id))
        .map((c) => ({ class_id: c.id, code: c.code, title: c.title })),
    });
  }

  students.sort((a, b) => a.name.localeCompare(b.name));
  return students;
}
