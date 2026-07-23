import { createClient } from "@/lib/supabase/server";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import {
  getClassesForEducator,
  getEducatorClassStats,
  type EducatorClassStats,
  type EducatorClassSummary,
} from "@/lib/queries/educator";
import { getVideoLibrary } from "@/lib/queries/video-library";
import { getNoteLibrary } from "@/lib/queries/note-library";
import { getReviewsForEducatorManage } from "@/lib/queries/educator-reviews";
import { getDisplayName, intervalToSeconds } from "@/lib/utils/format";
import type { EducatorProfile } from "@/lib/types/database";

export interface EducatorClassWithStats extends EducatorClassSummary {
  stats: EducatorClassStats;
}

export interface EducatorTeachingAggregates {
  total_classes: number;
  published_classes: number;
  draft_classes: number;
  /** SUM of per-class enrolments — one student in two classes counts twice. */
  total_enrolments: number;
  /** Distinct user_ids across every enrolment in the educator's classes. */
  unique_students: number;
  total_topics: number;
  total_videos: number;
  total_open_questions: number;
  total_completions: number;
  total_watch_seconds: number;
  /**
   * completions ÷ Σ(students × lessons) per class, 0–100; 0 when the denominator is 0. The
   * denominator is the FULL curriculum for every student — Access-Pass-scoped students count
   * against lessons they cannot reach (inherited from getEducatorClassStats, same as /statistics),
   * so the UI labels this "across the full curriculum".
   */
  overall_completion_rate: number;
}

export interface EducatorLibrarySummary {
  video_total: number;
  video_ready: number;
  /** uploading + queued + processing. */
  video_in_progress: number;
  video_errored: number;
  video_placed: number;
  video_unplaced: number;
  video_duration_seconds: number;
  note_total: number;
  note_placed: number;
  note_unplaced: number;
  note_total_bytes: number;
}

export interface EducatorReviewSummary {
  total: number;
  visible: number;
  hidden: number;
  imported: number;
  verified: number;
  /** Mean rating of VISIBLE reviews (matches the trigger-maintained public aggregate); null when none. */
  average_visible_rating: number | null;
  /** True when the reviews read failed — the counts above are then unknown, not zero. */
  load_failed: boolean;
}

export interface EducatorAdminHud {
  educatorProfile: EducatorProfile | null;
  classes: EducatorClassWithStats[];
  teaching: EducatorTeachingAggregates;
  library: EducatorLibrarySummary;
  reviews: EducatorReviewSummary;
  /** Display name of the admin who verified this educator; null when unverified or unresolvable. */
  verifiedByName: string | null;
}

async function countUniqueStudents(classIds: string[]): Promise<number> {
  if (classIds.length === 0) return 0;
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_enrollments")
    .select("user_id")
    .in("class_id", classIds);
  return new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)).size;
}

async function resolveVerifiedByName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles_public")
    .select("first_name, last_name, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return getDisplayName(data.first_name, data.last_name, data.display_name);
}

/**
 * Everything the admin HUD shows for one educator, assembled in one call. Admin-only by RLS
 * consequence (every underlying read returns empty/null for non-admin callers) — the page gates the
 * role explicitly before calling. Per-class stats are fetched with Promise.all: admin page, low
 * traffic, small class counts. getReviewsForEducatorManage THROWS on a read error, so it is caught
 * here and degraded to a load_failed summary — a transient reviews hiccup must never take down the
 * tier/verified/publish controls this page exists for.
 */
export async function getEducatorAdminHud(educatorId: string): Promise<EducatorAdminHud> {
  const [educatorProfile, classSummaries, videos, notes, reviewRows] = await Promise.all([
    getEducatorProfile(educatorId),
    getClassesForEducator(educatorId),
    getVideoLibrary(educatorId),
    getNoteLibrary(educatorId),
    getReviewsForEducatorManage(educatorId).catch(() => null),
  ]);

  const classIds = classSummaries.map((c) => c.id);

  const [perClassStats, uniqueStudents, verifiedByName] = await Promise.all([
    Promise.all(classSummaries.map((c) => getEducatorClassStats(c.id))),
    countUniqueStudents(classIds),
    resolveVerifiedByName(educatorProfile?.verified_by ?? null),
  ]);

  const classes: EducatorClassWithStats[] = classSummaries.map((c, i) => ({
    ...c,
    stats: perClassStats[i],
  }));

  const publishedClasses = classes.filter((c) => c.is_published).length;
  const totalCompletions = classes.reduce((acc, c) => acc + c.stats.total_completions, 0);
  const completionDenominator = classes.reduce(
    (acc, c) => acc + c.stats.total_students * c.stats.total_videos,
    0,
  );

  const teaching: EducatorTeachingAggregates = {
    total_classes: classes.length,
    published_classes: publishedClasses,
    draft_classes: classes.length - publishedClasses,
    total_enrolments: classes.reduce((acc, c) => acc + c.student_count, 0),
    unique_students: uniqueStudents,
    total_topics: classes.reduce((acc, c) => acc + c.topic_count, 0),
    total_videos: classes.reduce((acc, c) => acc + c.video_count, 0),
    total_open_questions: classes.reduce((acc, c) => acc + c.unanswered_post_count, 0),
    total_completions: totalCompletions,
    total_watch_seconds: classes.reduce((acc, c) => acc + c.stats.total_watch_seconds, 0),
    overall_completion_rate:
      completionDenominator === 0
        ? 0
        : Math.round((totalCompletions / completionDenominator) * 100),
  };

  const videoPlaced = videos.filter((v) => v.placements.length > 0).length;
  const notePlaced = notes.filter((n) => n.placements.length > 0).length;

  const library: EducatorLibrarySummary = {
    video_total: videos.length,
    video_ready: videos.filter((v) => v.status === "ready").length,
    video_in_progress: videos.filter(
      (v) => v.status === "uploading" || v.status === "queued" || v.status === "processing",
    ).length,
    video_errored: videos.filter((v) => v.status === "errored").length,
    video_placed: videoPlaced,
    video_unplaced: videos.length - videoPlaced,
    video_duration_seconds: videos.reduce((acc, v) => acc + intervalToSeconds(v.duration), 0),
    note_total: notes.length,
    note_placed: notePlaced,
    note_unplaced: notes.length - notePlaced,
    note_total_bytes: notes.reduce((acc, n) => acc + n.size_bytes, 0),
  };

  const visibleReviews = (reviewRows ?? []).filter((r) => r.is_visible);
  const reviews: EducatorReviewSummary =
    reviewRows === null
      ? {
          total: 0,
          visible: 0,
          hidden: 0,
          imported: 0,
          verified: 0,
          average_visible_rating: null,
          load_failed: true,
        }
      : {
          total: reviewRows.length,
          visible: visibleReviews.length,
          hidden: reviewRows.length - visibleReviews.length,
          imported: reviewRows.filter((r) => r.source === "imported").length,
          verified: reviewRows.filter((r) => r.source === "verified").length,
          average_visible_rating:
            visibleReviews.length === 0
              ? null
              : Math.round(
                  (visibleReviews.reduce((acc, r) => acc + r.rating, 0) / visibleReviews.length) *
                    10,
                ) / 10,
          load_failed: false,
        };

  return { educatorProfile, classes, teaching, library, reviews, verifiedByName };
}
