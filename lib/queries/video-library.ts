import { createClient } from "@/lib/supabase/server";
import type { Video } from "@/lib/types/database";

export interface VideoPlacementSummary {
  placement_id: string;
  subtopic_id: string;
  subtopic_title: string;
  topic_id: string;
  topic_title: string;
  class_id: string;
  class_title: string;
  class_code: string;
}

export interface LibraryVideo extends Video {
  placements: VideoPlacementSummary[];
}

/**
 * The educator's whole video library: every video they own, each with the
 * subtopics it is placed in (resolved up to class + topic labels for the portal
 * chips and assign picker). Unplaced videos come back with an empty placements
 * array — the to-many embed is deliberately NOT an inner join so they survive.
 */
export async function getVideoLibrary(ownerId: string): Promise<LibraryVideo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("videos")
    .select(
      "id, owner_id, title, description, duration, video_url, cloudflare_uid, status, thumbnail_url, created_at, updated_at, video_placements(id, subtopic_id, order_index, subtopics!inner(id, title, topics!inner(id, title, class_id, classes!inner(id, title, code))))",
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Array<
    Video & {
      video_placements: Array<{
        id: string;
        subtopic_id: string;
        order_index: number;
        subtopics: {
          id: string;
          title: string;
          topics: {
            id: string;
            title: string;
            class_id: string;
            classes: { id: string; title: string; code: string };
          };
        };
      }>;
    }
  >;

  return rows.map((row) => {
    const { video_placements, ...video } = row;
    const placements: VideoPlacementSummary[] = video_placements.map((placement) => ({
      placement_id: placement.id,
      subtopic_id: placement.subtopic_id,
      subtopic_title: placement.subtopics.title,
      topic_id: placement.subtopics.topics.id,
      topic_title: placement.subtopics.topics.title,
      class_id: placement.subtopics.topics.class_id,
      class_title: placement.subtopics.topics.classes.title,
      class_code: placement.subtopics.topics.classes.code,
    }));
    placements.sort(
      (a, b) =>
        a.class_title.localeCompare(b.class_title) || a.topic_title.localeCompare(b.topic_title),
    );
    return { ...(video as Video), placements };
  });
}

export interface PlacementTreeSubtopic {
  id: string;
  title: string;
}

export interface PlacementTreeTopic {
  id: string;
  title: string;
  subtopics: PlacementTreeSubtopic[];
}

export interface PlacementTreeClass {
  id: string;
  title: string;
  code: string;
  topics: PlacementTreeTopic[];
}

/**
 * The educator's classes → topics → subtopics, ordered, for the assign picker.
 * Classes with no curriculum yet come back with an empty topics array so the
 * dialog can hint "no subtopics yet".
 */
export async function getEducatorPlacementTree(ownerId: string): Promise<PlacementTreeClass[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("id, title, code, topics(id, title, order_index, subtopics(id, title, order_index))")
    .eq("educator_id", ownerId)
    .order("title", { ascending: true });

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    title: string;
    code: string;
    topics: Array<{
      id: string;
      title: string;
      order_index: number;
      subtopics: Array<{ id: string; title: string; order_index: number }>;
    }>;
  }>;

  return rows.map((cls) => ({
    id: cls.id,
    title: cls.title,
    code: cls.code,
    topics: [...cls.topics]
      .sort((a, b) => a.order_index - b.order_index)
      .map((topic) => ({
        id: topic.id,
        title: topic.title,
        subtopics: [...topic.subtopics]
          .sort((a, b) => a.order_index - b.order_index)
          .map((subtopic) => ({ id: subtopic.id, title: subtopic.title })),
      })),
  }));
}
