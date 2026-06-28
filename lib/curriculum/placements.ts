import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PlacementParent, Profile } from "@/lib/types/database";

export type { PlacementParent };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type PlacementTable = "video_placements" | "resource_placements";

/** The DB columns for a polymorphic placement parent — exactly one is non-null. */
export function parentColumns(parent: PlacementParent): {
  topic_id: string | null;
  subtopic_id: string | null;
} {
  return parent.kind === "topic"
    ? { topic_id: parent.id, subtopic_id: null }
    : { topic_id: null, subtopic_id: parent.id };
}

/** A stable key for a parent, for set membership / dedupe across kinds. */
export function parentKey(parent: PlacementParent): string {
  return `${parent.kind}:${parent.id}`;
}

/** Recover a PlacementParent from a placement row's polymorphic columns. */
export function parentOf(row: { topic_id: string | null; subtopic_id: string | null }): PlacementParent | null {
  if (row.topic_id) return { kind: "topic", id: row.topic_id };
  if (row.subtopic_id) return { kind: "subtopic", id: row.subtopic_id };
  return null;
}

/**
 * Resolve a placement parent (topic or subtopic) to its class id AND confirm the caller owns that
 * class (admins always pass). RLS is the real backstop; this returns a clean message instead of a raw
 * row-level-security violation, and supplies the class id callers need for revalidation / Q&A cleanup.
 */
export async function resolveOwnedParentClass(
  supabase: SupabaseServerClient,
  profile: Profile,
  parent: PlacementParent,
): Promise<{ classId: string } | { error: string }> {
  if (parent.kind === "topic") {
    const { data } = await supabase
      .from("topics")
      .select("class_id, classes!inner(educator_id)")
      .eq("id", parent.id)
      .maybeSingle();
    const row = data as { class_id: string; classes: { educator_id: string | null } } | null;
    if (!row) return { error: "Topic not found." };
    if (profile.role !== "admin" && row.classes.educator_id !== profile.id) {
      return { error: "You don't have permission to edit this class." };
    }
    return { classId: row.class_id };
  }

  const { data } = await supabase
    .from("subtopics")
    .select("topics!inner(class_id, classes!inner(educator_id))")
    .eq("id", parent.id)
    .maybeSingle();
  const row = data as { topics: { class_id: string; classes: { educator_id: string | null } } } | null;
  if (!row) return { error: "Subtopic not found." };
  if (profile.role !== "admin" && row.topics.classes.educator_id !== profile.id) {
    return { error: "You don't have permission to edit this class." };
  }
  return { classId: row.topics.class_id };
}

/** Next order_index (max + 1) for a placement table within a given parent node. */
export async function nextPlacementOrder(
  supabase: SupabaseServerClient,
  table: PlacementTable,
  parent: PlacementParent,
): Promise<number> {
  const column = parent.kind === "topic" ? "topic_id" : "subtopic_id";
  const { data } = await supabase
    .from(table)
    .select("order_index")
    .eq(column, parent.id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { order_index: number } | null)?.order_index ?? -1) + 1;
}

/** The topic ids + subtopic ids that make up a class — the two parent kinds a placement can hang off. */
export async function classNodeIds(
  supabase: SupabaseServerClient,
  classId: string,
): Promise<{ topicIds: string[]; subtopicIds: string[] }> {
  const [{ data: topics }, { data: subs }] = await Promise.all([
    supabase.from("topics").select("id").eq("class_id", classId),
    supabase.from("subtopics").select("id, topics!inner(class_id)").eq("topics.class_id", classId),
  ]);
  return {
    topicIds: ((topics ?? []) as Array<{ id: string }>).map((t) => t.id),
    subtopicIds: ((subs ?? []) as unknown as Array<{ id: string }>).map((s) => s.id),
  };
}

/**
 * A PostgREST `.or()` filter string selecting placements under a class — i.e. whose topic_id is one of
 * the class's topics OR whose subtopic_id is one of its subtopics. Returns null when the class has no
 * curriculum nodes at all (caller should short-circuit to an empty result rather than query).
 */
export function placementsUnderClassFilter(topicIds: string[], subtopicIds: string[]): string | null {
  const clauses: string[] = [];
  if (topicIds.length) clauses.push(`topic_id.in.(${topicIds.join(",")})`);
  if (subtopicIds.length) clauses.push(`subtopic_id.in.(${subtopicIds.join(",")})`);
  return clauses.length ? clauses.join(",") : null;
}

/**
 * Placed videos for a class — one entry per placement (topic- or subtopic-level), each carrying its
 * video's id + title, ordered by order_index. A shared video placed twice appears twice; callers that
 * want distinct videos dedupe by id. Shared by the stats, roster, and analytics queries so the
 * topic+subtopic resolution lives in one place.
 */
export async function placedVideoRowsForClass(
  supabase: SupabaseServerClient,
  classId: string,
): Promise<Array<{ id: string; title: string; order_index: number }>> {
  const { topicIds, subtopicIds } = await classNodeIds(supabase, classId);
  const orFilter = placementsUnderClassFilter(topicIds, subtopicIds);
  if (!orFilter) return [];
  const { data } = await supabase
    .from("video_placements")
    .select("order_index, videos!inner(id, title)")
    .or(orFilter)
    .order("order_index", { ascending: true });
  return ((data ?? []) as unknown as Array<{ order_index: number; videos: { id: string; title: string } }>).map(
    (r) => ({ id: r.videos.id, title: r.videos.title, order_index: r.order_index }),
  );
}

/**
 * Resolve a set of placement rows to the distinct classes they belong to. A row's class comes from
 * whichever parent (topic or subtopic) is set, so we batch-resolve both kinds. Used to compute which
 * classes gain/lose a piece of content during a placement reconcile.
 */
export async function classesForPlacementRows(
  supabase: SupabaseServerClient,
  rows: Array<{ topic_id: string | null; subtopic_id: string | null }>,
): Promise<Map<string, string>> {
  const topicIds = [...new Set(rows.map((r) => r.topic_id).filter((id): id is string => Boolean(id)))];
  const subtopicIds = [...new Set(rows.map((r) => r.subtopic_id).filter((id): id is string => Boolean(id)))];

  const topicClass = new Map<string, string>();
  const subtopicClass = new Map<string, string>();

  if (topicIds.length > 0) {
    const { data } = await supabase.from("topics").select("id, class_id").in("id", topicIds);
    for (const t of (data ?? []) as Array<{ id: string; class_id: string }>) topicClass.set(t.id, t.class_id);
  }
  if (subtopicIds.length > 0) {
    const { data } = await supabase
      .from("subtopics")
      .select("id, topics!inner(class_id)")
      .in("id", subtopicIds);
    for (const s of (data ?? []) as unknown as Array<{ id: string; topics: { class_id: string } }>) {
      subtopicClass.set(s.id, s.topics.class_id);
    }
  }

  /** key = parentKey(parent), value = class_id */
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.topic_id && topicClass.has(r.topic_id)) out.set(`topic:${r.topic_id}`, topicClass.get(r.topic_id)!);
    else if (r.subtopic_id && subtopicClass.has(r.subtopic_id)) {
      out.set(`subtopic:${r.subtopic_id}`, subtopicClass.get(r.subtopic_id)!);
    }
  }
  return out;
}
