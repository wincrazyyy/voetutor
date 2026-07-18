import { createClient } from "@/lib/supabase/server";
import { intervalToSeconds } from "@/lib/utils/format";
import { getCurriculumForClass, type CurriculumItem, type VideoWithProgress } from "@/lib/queries/curriculum";
import type { EnrolledClassSummary } from "@/lib/queries/classes";

/**
 * The lesson the dashboard hero points a student at. `mode` distinguishes a half-watched video to
 * RESUME from the NEXT unwatched lesson to start. `context_title` is the subtopic title, or the topic
 * title for a topic-level video. Topic- AND subtopic-level placements both count (a video can be
 * placed directly on a topic, not only inside a subtopic).
 */
export interface DashboardLesson {
  video_id: string;
  video_title: string;
  context_title: string;
  class_id: string;
  class_code: string;
  class_title: string;
  duration: string | null;
  mode: "resume" | "next";
  /** Seconds left to watch (resume). 0 for a not-yet-started "next" lesson. */
  remaining_seconds: number;
}

interface PlacementContextRow {
  topic_id: string | null;
  subtopic_id: string | null;
  topics: { title: string; classes: { id: string; code: string; title: string } | null } | null;
  subtopics: { title: string; topics: { classes: { id: string; code: string; title: string } | null } | null } | null;
}

/** Resolve a placement row (topic OR subtopic) to the class + node title shown in the hero. */
function placementContext(
  pl: PlacementContextRow,
): { context_title: string; class_id: string; class_code: string; class_title: string } | null {
  if (pl.subtopics && pl.subtopics.topics?.classes) {
    const c = pl.subtopics.topics.classes;
    return { context_title: pl.subtopics.title, class_id: c.id, class_code: c.code, class_title: c.title };
  }
  if (pl.topics && pl.topics.classes) {
    const c = pl.topics.classes;
    return { context_title: pl.topics.title, class_id: c.id, class_code: c.code, class_title: c.title };
  }
  return null;
}

/**
 * The video the student was midway through (started, not completed), most recent first. Resolves the
 * placement in a second query keyed by video_id so BOTH topic- and subtopic-level placements are
 * covered — the previous single-query `subtopics!inner` join silently dropped topic-level videos and
 * showed "No active lesson". RLS filters the placement to a class the student can actually see, so a
 * video that was unplaced (or is outside a scoped student's Access Pass) is skipped, not shown.
 */
export async function getResumeLesson(userId: string): Promise<DashboardLesson | null> {
  const supabase = await createClient();
  try {
    const { data } = await supabase
      .from("user_video_progress")
      .select("video_id, last_position, videos!inner(title, duration)")
      .eq("user_id", userId)
      .eq("is_completed", false)
      .order("updated_at", { ascending: false })
      .limit(10);

    const rows = (data ?? []) as unknown as Array<{
      video_id: string;
      last_position: string | null;
      videos: { title: string; duration: string | null };
    }>;

    for (const row of rows) {
      const { data: plData } = await supabase
        .from("video_placements")
        .select("topic_id, subtopic_id, topics(title, classes(id, code, title)), subtopics(title, topics(classes(id, code, title)))")
        .eq("video_id", row.video_id)
        .limit(1)
        .maybeSingle();
      if (!plData) continue;
      const ctx = placementContext(plData as unknown as PlacementContextRow);
      if (!ctx) continue;
      const durationSec = intervalToSeconds(row.videos.duration);
      const positionSec = intervalToSeconds(row.last_position);
      return {
        video_id: row.video_id,
        video_title: row.videos.title,
        duration: row.videos.duration,
        mode: "resume",
        remaining_seconds: Math.max(0, durationSec - positionSec),
        ...ctx,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The next unwatched lesson to start, when there's nothing to resume — so a student who has completed
 * some (or zero) videos is guided to their next lesson instead of a dead "No active lesson" card.
 * Walks each enrolled class's curriculum (topic-level materials first, then each subtopic) in order and
 * returns the first not-completed video. Reuses getCurriculumForClass, so ordering, the topic/subtopic
 * interleave, per-user completion, and Access-Pass scope are all inherited — a scoped student is never
 * pointed at a lesson they can't open. Topic `status` is deliberately NOT consulted (it is visual-only
 * now); filtering on it is what made the class-page "Up Next" permanently dead. Only classes that still
 * have an unwatched video are walked, and it stops at the first hit.
 */
export async function getNextLesson(
  userId: string,
  classes: EnrolledClassSummary[],
): Promise<DashboardLesson | null> {
  const isUnwatchedVideo = (i: CurriculumItem): i is { kind: "video" } & VideoWithProgress =>
    i.kind === "video" && !i.is_completed;

  const nextFrom = (cls: EnrolledClassSummary, contextTitle: string, v: VideoWithProgress): DashboardLesson => ({
    video_id: v.id,
    video_title: v.title,
    context_title: contextTitle,
    class_id: cls.id,
    class_code: cls.code,
    class_title: cls.title,
    duration: v.duration,
    mode: "next",
    remaining_seconds: 0,
  });

  const candidates = classes.filter((c) => c.total_videos > c.watched_videos);
  for (const cls of candidates) {
    const curriculum = await getCurriculumForClass(cls.id, userId);
    for (const topic of curriculum) {
      const direct = topic.items.find(isUnwatchedVideo);
      if (direct) return nextFrom(cls, topic.title, direct);
      for (const sub of topic.subtopics) {
        const v = sub.items.find(isUnwatchedVideo);
        if (v) return nextFrom(cls, sub.title, v);
      }
    }
  }
  return null;
}

export interface DashboardStats {
  videos_watched: number;
  videos_total: number;
  weekly_watch_seconds: number;
  weekly_delta_seconds: number;
}

export async function getDashboardStats(
  userId: string,
  classes: EnrolledClassSummary[],
): Promise<DashboardStats> {
  const supabase = await createClient();

  /* Sum the per-class totals (which count topic- AND subtopic-level videos via getClassVideoTotals),
     so the header stat matches the class cards and no longer undercounts topic-level videos. */
  const videosTotal = classes.reduce((acc, c) => acc + c.total_videos, 0);
  const videosWatched = classes.reduce((acc, c) => acc + c.watched_videos, 0);

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
    videos_watched: videosWatched,
    videos_total: videosTotal,
    weekly_watch_seconds: thisWeek,
    weekly_delta_seconds: thisWeek - lastWeek,
  };
}
