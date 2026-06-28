import { createClient } from "@/lib/supabase/server";
import { classNodeIds, placementsUnderClassFilter } from "@/lib/curriculum/placements";
import type { Resource, Subtopic, Topic, Video } from "@/lib/types/database";

export interface VideoWithProgress extends Video {
  /** The video_placements row this curriculum entry came from. */
  placement_id: string;
  order_index: number;
  is_completed: boolean;
  last_position: string | null;
}

export interface NoteWithPlacement extends Resource {
  /** The resource_placements row this curriculum entry came from. */
  placement_id: string;
  order_index: number;
}

export interface SubtopicWithChildren extends Subtopic {
  videos: VideoWithProgress[];
  notes: NoteWithPlacement[];
}

export interface TopicWithChildren extends Topic {
  subtopics: SubtopicWithChildren[];
  /** Topic-level materials (e.g. an intro video / a topic-wide note), placed directly on the topic. */
  videos: VideoWithProgress[];
  notes: NoteWithPlacement[];
  total_videos: number;
  watched_videos: number;
}

interface VideoPlacementRow {
  id: string;
  topic_id: string | null;
  subtopic_id: string | null;
  order_index: number;
  videos: Video;
}

interface ResourcePlacementRow {
  id: string;
  topic_id: string | null;
  subtopic_id: string | null;
  order_index: number;
  resources: Resource;
}

export async function getCurriculumForClass(classId: string, userId: string): Promise<TopicWithChildren[]> {
  const supabase = await createClient();

  const [{ data: topicsRaw }, { data: subtopicsRaw }, nodes] = await Promise.all([
    supabase
      .from("topics")
      .select("id, class_id, title, total_duration, status, order_index, created_at, updated_at")
      .eq("class_id", classId)
      .order("order_index", { ascending: true }),
    supabase
      .from("subtopics")
      .select("id, topic_id, title, order_index, created_at, updated_at, topics!inner(class_id)")
      .eq("topics.class_id", classId)
      .order("order_index", { ascending: true }),
    classNodeIds(supabase, classId),
  ]);

  const topics = (topicsRaw ?? []) as Topic[];
  const subtopics = (subtopicsRaw ?? []) as unknown as Subtopic[];

  const orFilter = placementsUnderClassFilter(nodes.topicIds, nodes.subtopicIds);

  let videoPlacements: VideoPlacementRow[] = [];
  let resourcePlacements: ResourcePlacementRow[] = [];
  if (orFilter) {
    const [{ data: vp }, { data: rp }] = await Promise.all([
      supabase
        .from("video_placements")
        .select(
          "id, topic_id, subtopic_id, order_index, videos!inner(id, owner_id, title, description, duration, video_url, cloudflare_uid, status, thumbnail_url, created_at, updated_at)",
        )
        .or(orFilter)
        .order("order_index", { ascending: true }),
      supabase
        .from("resource_placements")
        .select(
          "id, topic_id, subtopic_id, order_index, resources!inner(id, owner_id, title, description, size_bytes, file_url, created_at, updated_at)",
        )
        .or(orFilter)
        .order("order_index", { ascending: true }),
    ]);
    videoPlacements = (vp ?? []) as unknown as VideoPlacementRow[];
    resourcePlacements = (rp ?? []) as unknown as ResourcePlacementRow[];
  }

  const videoIds = [...new Set(videoPlacements.map((p) => p.videos.id))];
  let progressMap = new Map<string, { is_completed: boolean; last_position: string | null }>();
  if (videoIds.length > 0) {
    const { data: progressRaw } = await supabase
      .from("user_video_progress")
      .select("video_id, is_completed, last_position")
      .eq("user_id", userId)
      .in("video_id", videoIds);
    progressMap = new Map(
      (progressRaw ?? []).map((p) => {
        const r = p as { video_id: string; is_completed: boolean; last_position: string | null };
        return [r.video_id, { is_completed: r.is_completed, last_position: r.last_position }];
      }),
    );
  }

  const toVideo = (p: VideoPlacementRow): VideoWithProgress => {
    const progress = progressMap.get(p.videos.id);
    return {
      ...p.videos,
      placement_id: p.id,
      order_index: p.order_index,
      is_completed: progress?.is_completed ?? false,
      last_position: progress?.last_position ?? null,
    };
  };
  const toNote = (p: ResourcePlacementRow): NoteWithPlacement => ({
    ...p.resources,
    placement_id: p.id,
    order_index: p.order_index,
  });
  const byOrder = <T extends { order_index: number }>(a: T, b: T) => a.order_index - b.order_index;

  return topics.map((topic) => {
    const topicVideos = videoPlacements.filter((p) => p.topic_id === topic.id).map(toVideo).sort(byOrder);
    const topicNotes = resourcePlacements.filter((p) => p.topic_id === topic.id).map(toNote).sort(byOrder);

    const mySubtopics = subtopics
      .filter((s) => s.topic_id === topic.id)
      .map<SubtopicWithChildren>((sub) => ({
        ...sub,
        videos: videoPlacements.filter((p) => p.subtopic_id === sub.id).map(toVideo).sort(byOrder),
        notes: resourcePlacements.filter((p) => p.subtopic_id === sub.id).map(toNote).sort(byOrder),
      }));

    const allVideos = [...topicVideos, ...mySubtopics.flatMap((s) => s.videos)];
    const watched = allVideos.filter((v) => v.is_completed).length;

    return {
      ...topic,
      subtopics: mySubtopics,
      videos: topicVideos,
      notes: topicNotes,
      total_videos: allVideos.length,
      watched_videos: watched,
    };
  });
}

export async function getVideoById(videoId: string): Promise<Video | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("videos")
    .select("id, owner_id, title, description, duration, video_url, cloudflare_uid, status, thumbnail_url, created_at, updated_at")
    .eq("id", videoId)
    .maybeSingle();
  return (data as Video | null) ?? null;
}

/**
 * Every class a video is placed into (via video_placements, topic- or subtopic-level). A library
 * video can appear in several classes, so callers (e.g. lesson-page authorization) must consider the
 * whole set rather than a single owning class.
 */
export async function getClassIdsForVideo(videoId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("video_placements")
    .select("topic_id, subtopic_id, topics(class_id), subtopics(topics(class_id))")
    .eq("video_id", videoId);
  if (!data) return [];
  const ids = (data as unknown as Array<{
    topics: { class_id: string } | null;
    subtopics: { topics: { class_id: string } } | null;
  }>).map((row) => row.topics?.class_id ?? row.subtopics?.topics.class_id ?? null);
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}
