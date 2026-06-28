"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";
import { deleteVideo } from "@/lib/cloudflare/client";
import {
  type PlacementParent,
  parentColumns,
  parentKey,
  parentOf,
  resolveOwnedParentClass,
  classesForPlacementRows,
} from "@/lib/curriculum/placements";
import { NOTES_BUCKET, notePathFromUrl } from "@/lib/storage/notes";
import type { Profile } from "@/lib/types/database";

export interface CurriculumActionState {
  error?: string;
  ok?: boolean;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function parseTitle(raw: string): string | { error: string } {
  const title = raw.trim();
  if (!title) return { error: "A title is required." };
  if (title.length > 255) return { error: "Title must be 255 characters or fewer." };
  return title;
}

async function requireEducator(): Promise<{ profile: Profile } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can edit curriculum." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }
  return { profile };
}

/**
 * Friendly-error ownership check. RLS (topics/subtopics_modify_educator_or_admin)
 * is the real guard; this just turns the common "not your class" case into a
 * clean message instead of a raw row-level-security violation.
 */
async function ownsClass(
  supabase: SupabaseServerClient,
  classId: string,
  profile: Profile,
): Promise<boolean> {
  if (profile.role === "admin") return true;
  const { data } = await supabase
    .from("classes")
    .select("educator_id")
    .eq("id", classId)
    .maybeSingle();
  return (data as { educator_id: string | null } | null)?.educator_id === profile.id;
}

/**
 * Garbage-collects library videos that no longer appear in any placement. Given
 * the videos that *were* placed under a just-deleted topic/subtopic, it deletes
 * the rows whose placements have all cascaded away (and best-effort reaps their
 * Cloudflare counterparts, which the Postgres cascade never reaches). Videos
 * still placed elsewhere — shared across classes — are left untouched.
 */
async function gcOrphanedVideos(
  supabase: SupabaseServerClient,
  candidateIds: string[],
): Promise<void> {
  if (candidateIds.length === 0) return;
  const { data: remaining } = await supabase
    .from("video_placements")
    .select("video_id")
    .in("video_id", candidateIds);
  const stillPlaced = new Set(
    ((remaining ?? []) as Array<{ video_id: string }>).map((row) => row.video_id),
  );
  const orphanIds = candidateIds.filter((id) => !stillPlaced.has(id));
  if (orphanIds.length === 0) return;

  const { data: orphanRows } = await supabase
    .from("videos")
    .select("cloudflare_uid")
    .in("id", orphanIds);
  await supabase.from("videos").delete().in("id", orphanIds);
  const uids = ((orphanRows ?? []) as Array<{ cloudflare_uid: string | null }>)
    .map((row) => row.cloudflare_uid)
    .filter((uid): uid is string => Boolean(uid));
  await Promise.all(uids.map((uid) => deleteVideo(uid).catch(() => undefined)));
}

/** Notes analogue of gcOrphanedVideos: deletes library notes left with no placement and reaps storage. */
async function gcOrphanedResources(
  supabase: SupabaseServerClient,
  candidateIds: string[],
): Promise<void> {
  if (candidateIds.length === 0) return;
  const { data: remaining } = await supabase
    .from("resource_placements")
    .select("resource_id")
    .in("resource_id", candidateIds);
  const stillPlaced = new Set(
    ((remaining ?? []) as Array<{ resource_id: string }>).map((row) => row.resource_id),
  );
  const orphanIds = candidateIds.filter((id) => !stillPlaced.has(id));
  if (orphanIds.length === 0) return;

  const { data: orphanRows } = await supabase
    .from("resources")
    .select("file_url")
    .in("id", orphanIds);
  await supabase.from("resources").delete().in("id", orphanIds);
  const paths = ((orphanRows ?? []) as Array<{ file_url: string }>)
    .map((row) => notePathFromUrl(row.file_url))
    .filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    await supabase.storage.from(NOTES_BUCKET).remove(paths).catch(() => undefined);
  }
}

/** Distinct placed video ids under a topic — both topic-level and via its subtopics. */
async function videoIdsUnderTopic(supabase: SupabaseServerClient, topicId: string): Promise<string[]> {
  const [{ data: direct }, { data: viaSub }] = await Promise.all([
    supabase.from("video_placements").select("video_id").eq("topic_id", topicId),
    supabase.from("video_placements").select("video_id, subtopics!inner(topic_id)").eq("subtopics.topic_id", topicId),
  ]);
  return [
    ...new Set([
      ...((direct ?? []) as Array<{ video_id: string }>).map((r) => r.video_id),
      ...((viaSub ?? []) as Array<{ video_id: string }>).map((r) => r.video_id),
    ]),
  ];
}

/** Distinct placed note ids under a topic — both topic-level and via its subtopics. */
async function resourceIdsUnderTopic(supabase: SupabaseServerClient, topicId: string): Promise<string[]> {
  const [{ data: direct }, { data: viaSub }] = await Promise.all([
    supabase.from("resource_placements").select("resource_id").eq("topic_id", topicId),
    supabase.from("resource_placements").select("resource_id, subtopics!inner(topic_id)").eq("subtopics.topic_id", topicId),
  ]);
  return [
    ...new Set([
      ...((direct ?? []) as Array<{ resource_id: string }>).map((r) => r.resource_id),
      ...((viaSub ?? []) as Array<{ resource_id: string }>).map((r) => r.resource_id),
    ]),
  ];
}

export async function createTopicAction(
  classId: string,
  title: string,
): Promise<CurriculumActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };

  const parsed = parseTitle(title);
  if (typeof parsed !== "string") return parsed;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, classId, auth.profile))) {
    return { error: "You don't have permission to edit this class." };
  }

  const { data: lastTopic } = await supabase
    .from("topics")
    .select("order_index")
    .eq("class_id", classId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orderIndex = ((lastTopic as { order_index: number } | null)?.order_index ?? -1) + 1;

  const { error } = await supabase
    .from("topics")
    .insert({ class_id: classId, title: parsed, order_index: orderIndex, status: "active" });
  if (error) return { error: error.message };

  revalidatePath(`/class/${classId}`);
  return { ok: true };
}

export async function renameTopicAction(
  topicId: string,
  classId: string,
  title: string,
): Promise<CurriculumActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };

  const parsed = parseTitle(title);
  if (typeof parsed !== "string") return parsed;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, classId, auth.profile))) {
    return { error: "You don't have permission to edit this class." };
  }

  const { error } = await supabase.from("topics").update({ title: parsed }).eq("id", topicId);
  if (error) return { error: error.message };

  revalidatePath(`/class/${classId}`);
  return { ok: true };
}

export async function deleteTopicAction(
  topicId: string,
  classId: string,
): Promise<CurriculumActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  if (!(await ownsClass(supabase, classId, auth.profile))) {
    return { error: "You don't have permission to edit this class." };
  }

  const videoCandidates = await videoIdsUnderTopic(supabase, topicId);
  const resourceCandidates = await resourceIdsUnderTopic(supabase, topicId);

  const { error } = await supabase.from("topics").delete().eq("id", topicId);
  if (error) return { error: error.message };

  await gcOrphanedVideos(supabase, videoCandidates);
  await gcOrphanedResources(supabase, resourceCandidates);

  revalidatePath(`/class/${classId}`);
  return { ok: true };
}

export async function createSubtopicAction(
  topicId: string,
  classId: string,
  title: string,
): Promise<CurriculumActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };

  const parsed = parseTitle(title);
  if (typeof parsed !== "string") return parsed;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, classId, auth.profile))) {
    return { error: "You don't have permission to edit this class." };
  }

  const { data: lastSubtopic } = await supabase
    .from("subtopics")
    .select("order_index")
    .eq("topic_id", topicId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const orderIndex = ((lastSubtopic as { order_index: number } | null)?.order_index ?? -1) + 1;

  const { error } = await supabase
    .from("subtopics")
    .insert({ topic_id: topicId, title: parsed, order_index: orderIndex });
  if (error) return { error: error.message };

  revalidatePath(`/class/${classId}`);
  return { ok: true };
}

export async function renameSubtopicAction(
  subtopicId: string,
  classId: string,
  title: string,
): Promise<CurriculumActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };

  const parsed = parseTitle(title);
  if (typeof parsed !== "string") return parsed;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, classId, auth.profile))) {
    return { error: "You don't have permission to edit this class." };
  }

  const { error } = await supabase
    .from("subtopics")
    .update({ title: parsed })
    .eq("id", subtopicId);
  if (error) return { error: error.message };

  revalidatePath(`/class/${classId}`);
  return { ok: true };
}

export async function deleteSubtopicAction(
  subtopicId: string,
  classId: string,
): Promise<CurriculumActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  if (!(await ownsClass(supabase, classId, auth.profile))) {
    return { error: "You don't have permission to edit this class." };
  }

  const [{ data: videoCandidates }, { data: resourceCandidates }] = await Promise.all([
    supabase.from("video_placements").select("video_id").eq("subtopic_id", subtopicId),
    supabase.from("resource_placements").select("resource_id").eq("subtopic_id", subtopicId),
  ]);
  const videoIds = [
    ...new Set(((videoCandidates ?? []) as Array<{ video_id: string }>).map((row) => row.video_id)),
  ];
  const resourceIds = [
    ...new Set(((resourceCandidates ?? []) as Array<{ resource_id: string }>).map((row) => row.resource_id)),
  ];

  const { error } = await supabase.from("subtopics").delete().eq("id", subtopicId);
  if (error) return { error: error.message };

  await gcOrphanedVideos(supabase, videoIds);
  await gcOrphanedResources(supabase, resourceIds);

  revalidatePath(`/class/${classId}`);
  return { ok: true };
}

/**
 * Persists the canonical ordered membership of a parent node (topic or subtopic) for one placement
 * table. Every id in orderedPlacementIds is set to (parent, order_index = its position), so this
 * single helper covers BOTH in-place reordering and moves between sibling nodes of the same class.
 * Moves stay within one class (validated below), so the UPDATE never changes a placement's class and
 * internal.protect_placement_forum_lineage early-exits. order_index has no unique constraint, so
 * concurrent writes settle to a clean 0..n-1 sequence; the partial UNIQUE indexes are the backstop if
 * a piece of content is dragged onto a node it already lives in.
 */
async function reorderPlacements(
  table: "video_placements" | "resource_placements",
  classId: string,
  parent: PlacementParent,
  orderedPlacementIds: string[],
  profile: Profile,
): Promise<CurriculumActionState> {
  const supabase = await createClient();
  if (!(await ownsClass(supabase, classId, profile))) {
    return { error: "You don't have permission to edit this class." };
  }

  const resolved = await resolveOwnedParentClass(supabase, profile, parent);
  if ("error" in resolved) return { error: resolved.error };
  if (resolved.classId !== classId) return { error: "That node is not in this class." };

  if (orderedPlacementIds.length === 0) return { ok: true };

  /* Confirm every placement being reordered currently belongs to this class. */
  const { data: rows } = await supabase
    .from(table)
    .select("id, topic_id, subtopic_id")
    .in("id", orderedPlacementIds);
  const rowList = (rows ?? []) as Array<{ id: string; topic_id: string | null; subtopic_id: string | null }>;
  const classByParent = await classesForPlacementRows(supabase, rowList);
  const allInClass =
    rowList.length === orderedPlacementIds.length &&
    rowList.every((r) => {
      const p = parentOf(r);
      return p ? classByParent.get(parentKey(p)) === classId : false;
    });
  if (!allInClass) return { error: "Some items are not in this class." };

  const cols = parentColumns(parent);
  const results = await Promise.all(
    orderedPlacementIds.map((placementId, index) =>
      supabase.from(table).update({ ...cols, order_index: index }).eq("id", placementId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    if (failed.error.code === "23505") {
      return { error: "That item is already in the destination node." };
    }
    return { error: failed.error.message };
  }

  revalidatePath(`/class/${classId}`);
  return { ok: true };
}

export async function reorderPlacedVideosAction(
  classId: string,
  parent: PlacementParent,
  orderedPlacementIds: string[],
): Promise<CurriculumActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };
  return reorderPlacements("video_placements", classId, parent, orderedPlacementIds, auth.profile);
}

export async function reorderPlacedNotesAction(
  classId: string,
  parent: PlacementParent,
  orderedPlacementIds: string[],
): Promise<CurriculumActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };
  return reorderPlacements("resource_placements", classId, parent, orderedPlacementIds, auth.profile);
}

export async function renameVideoAction(
  videoId: string,
  classId: string | null,
  title: string,
): Promise<CurriculumActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };

  const parsed = parseTitle(title);
  if (typeof parsed !== "string") return parsed;

  const supabase = await createClient();

  const { data: video } = await supabase
    .from("videos")
    .select("owner_id")
    .eq("id", videoId)
    .maybeSingle();
  const videoRow = video as { owner_id: string } | null;
  if (!videoRow) return { error: "Video not found." };
  if (auth.profile.role !== "admin" && videoRow.owner_id !== auth.profile.id) {
    return { error: "You don't have permission to edit this video." };
  }

  const { error } = await supabase.from("videos").update({ title: parsed }).eq("id", videoId);
  if (error) return { error: error.message };

  /* The curriculum board passes its class; the portal passes null (a video can
     span many classes) and refreshes the route itself. */
  if (classId) revalidatePath(`/class/${classId}`);
  else revalidatePath("/library");
  return { ok: true };
}
