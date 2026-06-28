import { createClient } from "@/lib/supabase/server";
import type { Resource } from "@/lib/types/database";
import { type PlacementSummary, toPlacementSummary } from "@/lib/queries/video-library";

export interface LibraryNote extends Resource {
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

const PLACEMENT_EMBED =
  "id, topic_id, subtopic_id, order_index, topics(id, title, class_id, classes(id, title, code)), subtopics(id, title, topics(id, title, class_id, classes(id, title, code)))";

/**
 * The educator's whole notes (PDF) library: every note they own, each with the topics/subtopics it is
 * placed in. Mirrors getVideoLibrary. Unplaced notes come back with an empty placements array.
 */
export async function getNoteLibrary(ownerId: string): Promise<LibraryNote[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("resources")
    .select(
      `id, owner_id, title, description, size_bytes, file_url, created_at, updated_at, resource_placements(${PLACEMENT_EMBED})`,
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Array<Resource & { resource_placements: PlacementEmbed[] }>;

  return rows.map((row) => {
    const { resource_placements, ...note } = row;
    const placements = resource_placements
      .map(toPlacementSummary)
      .filter((p): p is PlacementSummary => p !== null)
      .sort(
        (a, b) =>
          a.class_title.localeCompare(b.class_title) ||
          a.topic_title.localeCompare(b.topic_title) ||
          (a.subtopic_title ?? "").localeCompare(b.subtopic_title ?? ""),
      );
    return { ...(note as Resource), placements };
  });
}
