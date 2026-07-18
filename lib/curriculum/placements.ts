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

/**
 * Next order_index (max + 1) within a parent node, spanning BOTH video_placements and
 * resource_placements. Videos and notes share one per-node sequence, so newly-added content of either
 * kind appends after all existing content (video OR note) in the node.
 */
export async function nextPlacementOrder(
  supabase: SupabaseServerClient,
  parent: PlacementParent,
): Promise<number> {
  const column = parent.kind === "topic" ? "topic_id" : "subtopic_id";
  const maxFor = async (table: PlacementTable): Promise<number> => {
    const { data } = await supabase
      .from(table)
      .select("order_index")
      .eq(column, parent.id)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { order_index: number } | null)?.order_index ?? -1;
  };
  const [maxVideo, maxNote] = await Promise.all([
    maxFor("video_placements"),
    maxFor("resource_placements"),
  ]);
  return Math.max(maxVideo, maxNote) + 1;
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
 * video's id + title, in **curriculum reading order**: topics by order_index, then a topic's own
 * topic-level materials, then each of its subtopics (by order_index) and their content. `order_index`
 * is a PER-NODE sequence, so a flat global sort would interleave unrelated nodes — this mirrors the
 * order students see in `getCurriculumForClass`. A shared video placed twice appears twice; callers
 * that want distinct videos dedupe by id (first-seen wins, preserving reading order). Shared by the
 * stats, roster, and analytics queries so the topic+subtopic resolution lives in one place.
 */
export async function placedVideoRowsForClass(
  supabase: SupabaseServerClient,
  classId: string,
): Promise<Array<{ id: string; title: string; order_index: number }>> {
  const [{ data: topicsRaw }, { data: subtopicsRaw }] = await Promise.all([
    supabase.from("topics").select("id").eq("class_id", classId).order("order_index", { ascending: true }),
    supabase
      .from("subtopics")
      .select("id, topic_id, topics!inner(class_id)")
      .eq("topics.class_id", classId)
      .order("order_index", { ascending: true }),
  ]);

  const topics = (topicsRaw ?? []) as Array<{ id: string }>;
  const subtopics = (subtopicsRaw ?? []) as unknown as Array<{ id: string; topic_id: string }>;

  const orFilter = placementsUnderClassFilter(
    topics.map((t) => t.id),
    subtopics.map((s) => s.id),
  );
  if (!orFilter) return [];

  const { data } = await supabase
    .from("video_placements")
    .select("topic_id, subtopic_id, order_index, videos!inner(id, title)")
    .or(orFilter)
    .order("order_index", { ascending: true });

  const placements = (data ?? []) as unknown as Array<{
    topic_id: string | null;
    subtopic_id: string | null;
    order_index: number;
    videos: { id: string; title: string };
  }>;

  const out: Array<{ id: string; title: string; order_index: number }> = [];
  const emit = (accept: (p: (typeof placements)[number]) => boolean) => {
    for (const p of placements) {
      if (accept(p)) out.push({ id: p.videos.id, title: p.videos.title, order_index: p.order_index });
    }
  };

  /* `placements` and `subtopics` arrive order_index-ordered from the DB, so iterating topics in order
     and filtering per node reproduces the exact curriculum sequence without a further sort. */
  for (const topic of topics) {
    emit((p) => p.topic_id === topic.id);
    for (const sub of subtopics.filter((s) => s.topic_id === topic.id)) {
      emit((p) => p.subtopic_id === sub.id);
    }
  }
  return out;
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
