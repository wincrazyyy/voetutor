import { createClient } from "@/lib/supabase/server";
import type { Resource, Subtopic, Topic, Video } from "@/lib/types/database";

export interface VideoWithProgress extends Video {
  is_completed: boolean;
  last_position: string | null;
}

export interface SubtopicWithChildren extends Subtopic {
  videos: VideoWithProgress[];
  resources: Resource[];
}

export interface TopicWithChildren extends Topic {
  subtopics: SubtopicWithChildren[];
  resources: Resource[];
  total_videos: number;
  watched_videos: number;
}

export async function getCurriculumForClass(classId: string, userId: string): Promise<TopicWithChildren[]> {
  const supabase = await createClient();

  const [{ data: topicsRaw }, { data: subtopicsRaw }, { data: videosRaw }, { data: resourcesRaw }] = await Promise.all([
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
    supabase
      .from("videos")
      .select("id, subtopic_id, title, description, duration, video_url, cloudflare_uid, status, thumbnail_url, order_index, created_at, updated_at, subtopics!inner(topic_id, topics!inner(class_id))")
      .eq("subtopics.topics.class_id", classId)
      .order("order_index", { ascending: true }),
    supabase
      .from("resources")
      .select("id, title, size_bytes, file_url, topic_id, subtopic_id, created_at, updated_at"),
  ]);

  const topics = (topicsRaw ?? []) as Topic[];
  const subtopics = ((subtopicsRaw ?? []) as unknown as Subtopic[]);
  const videos = ((videosRaw ?? []) as unknown as Video[]);
  const resources = (resourcesRaw ?? []) as Resource[];

  const videoIds = videos.map((v) => v.id);
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

  const topicIds = new Set(topics.map((t) => t.id));
  const subtopicIds = new Set(subtopics.map((s) => s.id));

  const topicResources = resources.filter((r) => r.topic_id && topicIds.has(r.topic_id));
  const subtopicResources = resources.filter((r) => r.subtopic_id && subtopicIds.has(r.subtopic_id));

  return topics.map((topic) => {
    const myTopicResources = topicResources.filter((r) => r.topic_id === topic.id);
    const mySubtopics = subtopics
      .filter((s) => s.topic_id === topic.id)
      .map<SubtopicWithChildren>((sub) => {
        const subVideos = videos
          .filter((v) => v.subtopic_id === sub.id)
          .map<VideoWithProgress>((v) => {
            const progress = progressMap.get(v.id);
            return {
              ...v,
              is_completed: progress?.is_completed ?? false,
              last_position: progress?.last_position ?? null,
            };
          });
        const subResources = subtopicResources.filter((r) => r.subtopic_id === sub.id);
        return { ...sub, videos: subVideos, resources: subResources };
      });

    const allVideos = mySubtopics.flatMap((s) => s.videos);
    const watched = allVideos.filter((v) => v.is_completed).length;

    return {
      ...topic,
      subtopics: mySubtopics,
      resources: myTopicResources,
      total_videos: allVideos.length,
      watched_videos: watched,
    };
  });
}

export async function getVideoById(videoId: string): Promise<Video | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("videos")
    .select("id, subtopic_id, title, description, duration, video_url, cloudflare_uid, status, thumbnail_url, order_index, created_at, updated_at")
    .eq("id", videoId)
    .maybeSingle();
  return (data as Video | null) ?? null;
}

export async function getClassIdForVideo(videoId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("videos")
    .select("subtopics!inner(topics!inner(class_id))")
    .eq("id", videoId)
    .maybeSingle();
  if (!data) return null;
  const sub = (data as unknown as { subtopics: { topics: { class_id: string } } }).subtopics;
  return sub?.topics?.class_id ?? null;
}
