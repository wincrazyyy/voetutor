import { createClient } from "@/lib/supabase/server";
import { queryStreamAnalytics } from "@/lib/cloudflare/client";

export interface VideoAnalytics {
  videoId: string;
  title: string;
  minutesViewed: number;
  completions: number;
}

const STREAM_MINUTES_QUERY = `
query StreamMinutesViewed($accountTag: string!, $start: Date, $end: Date) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      streamMinutesViewedAdaptiveGroups(
        filter: { date_geq: $start, date_lt: $end }
        orderBy: [sum_minutesViewed_DESC]
        limit: 1000
      ) {
        sum { minutesViewed }
        dimensions { uid }
      }
    }
  }
}`;

interface StreamMinutesResponse {
  viewer: {
    accounts: Array<{
      streamMinutesViewedAdaptiveGroups: Array<{
        sum: { minutesViewed: number };
        dimensions: { uid: string };
      }>;
    }>;
  };
}

/** Cloudflare minutes-viewed per video uid over the trailing 90 days. */
async function fetchMinutesViewed(): Promise<Map<string, number>> {
  const accountTag = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountTag) return new Map();

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);

  try {
    const data = await queryStreamAnalytics<StreamMinutesResponse>(STREAM_MINUTES_QUERY, {
      accountTag,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    });
    const groups = data.viewer.accounts[0]?.streamMinutesViewedAdaptiveGroups ?? [];
    return new Map(groups.map((group) => [group.dimensions.uid, Math.round(group.sum.minutesViewed)]));
  } catch {
    /* Analytics is best-effort — a missing config or API error leaves the
       table showing zero minutes rather than failing the whole stats page. */
    return new Map();
  }
}

/**
 * Per-video analytics for a class: Cloudflare minutes-viewed (raw engagement)
 * joined with completion counts from user_video_progress (course progress).
 */
export async function getVideoAnalyticsForClass(classId: string): Promise<VideoAnalytics[]> {
  const supabase = await createClient();

  const { data: videoRows } = await supabase
    .from("videos")
    .select("id, title, cloudflare_uid, order_index, subtopics!inner(topics!inner(class_id))")
    .eq("subtopics.topics.class_id", classId)
    .order("order_index", { ascending: true });

  const videos = (videoRows ?? []) as Array<{
    id: string;
    title: string;
    cloudflare_uid: string | null;
  }>;
  if (videos.length === 0) return [];

  const videoIds = videos.map((video) => video.id);

  const [minutesByUid, { data: progressRows }] = await Promise.all([
    fetchMinutesViewed(),
    supabase
      .from("user_video_progress")
      .select("video_id")
      .in("video_id", videoIds)
      .eq("is_completed", true),
  ]);

  const completionsByVideo = new Map<string, number>();
  for (const row of (progressRows ?? []) as Array<{ video_id: string }>) {
    completionsByVideo.set(row.video_id, (completionsByVideo.get(row.video_id) ?? 0) + 1);
  }

  return videos.map((video) => ({
    videoId: video.id,
    title: video.title,
    minutesViewed: video.cloudflare_uid ? (minutesByUid.get(video.cloudflare_uid) ?? 0) : 0,
    completions: completionsByVideo.get(video.id) ?? 0,
  }));
}
