import { createClient } from "@/lib/supabase/server";
import type { Video } from "@/lib/types/database";

/** One placement of a library item, resolved up to its class/topic/subtopic labels (topic OR subtopic). */
export interface PlacementSummary {
  placement_id: string;
  parent_kind: "topic" | "subtopic";
  topic_id: string;
  topic_title: string;
  subtopic_id: string | null;
  subtopic_title: string | null;
  class_id: string;
  class_title: string;
  class_code: string;
}

export interface LibraryVideo extends Video {
  placements: PlacementSummary[];
}

interface ClassLabels {
  id: string;
  title: string;
  code: string;
}
interface PlacementEmbed {
  id: string;
  topic_id: string | null;
  subtopic_id: string | null;
  order_index: number;
  topics: { id: string; title: string; class_id: string; classes: ClassLabels } | null;
  subtopics: {
    id: string;
    title: string;
    topics: { id: string; title: string; class_id: string; classes: ClassLabels };
  } | null;
}

/** Map a polymorphic placement embed row to a flat PlacementSummary, or null if malformed. */
export function toPlacementSummary(p: PlacementEmbed): PlacementSummary | null {
  if (p.subtopic_id && p.subtopics) {
    return {
      placement_id: p.id,
      parent_kind: "subtopic",
      topic_id: p.subtopics.topics.id,
      topic_title: p.subtopics.topics.title,
      subtopic_id: p.subtopics.id,
      subtopic_title: p.subtopics.title,
      class_id: p.subtopics.topics.class_id,
      class_title: p.subtopics.topics.classes.title,
      class_code: p.subtopics.topics.classes.code,
    };
  }
  if (p.topic_id && p.topics) {
    return {
      placement_id: p.id,
      parent_kind: "topic",
      topic_id: p.topics.id,
      topic_title: p.topics.title,
      subtopic_id: null,
      subtopic_title: null,
      class_id: p.topics.class_id,
      class_title: p.topics.classes.title,
      class_code: p.topics.classes.code,
    };
  }
  return null;
}

const PLACEMENT_EMBED =
  "id, topic_id, subtopic_id, order_index, topics(id, title, class_id, classes(id, title, code)), subtopics(id, title, topics(id, title, class_id, classes(id, title, code)))";

function sortPlacements(placements: PlacementSummary[]): PlacementSummary[] {
  return placements.sort(
    (a, b) =>
      a.class_title.localeCompare(b.class_title) ||
      a.topic_title.localeCompare(b.topic_title) ||
      (a.subtopic_title ?? "").localeCompare(b.subtopic_title ?? ""),
  );
}

/**
 * The educator's whole video library: every video they own, each with the topics/subtopics it is
 * placed in (resolved to class + topic labels for the portal chips and assign picker). Unplaced videos
 * come back with an empty placements array — the to-many embed is deliberately NOT an inner join.
 */
export async function getVideoLibrary(ownerId: string): Promise<LibraryVideo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("videos")
    .select(
      `id, owner_id, title, description, duration, video_url, cloudflare_uid, status, thumbnail_url, created_at, updated_at, video_placements(${PLACEMENT_EMBED})`,
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Array<Video & { video_placements: PlacementEmbed[] }>;

  return rows.map((row) => {
    const { video_placements, ...video } = row;
    const placements = sortPlacements(
      video_placements
        .map(toPlacementSummary)
        .filter((p): p is PlacementSummary => p !== null),
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
 * The educator's classes → topics → subtopics, ordered, for the assign picker. Classes with no
 * curriculum yet come back with an empty topics array so the dialog can hint "no nodes yet".
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
