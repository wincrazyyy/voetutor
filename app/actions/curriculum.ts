"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";
import { deleteVideo } from "@/lib/cloudflare/client";
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
 * Garbage-collects library videos that no longer appear in any subtopic. Given
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

  revalidatePath(`/educator/classes/${classId}`);
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

  revalidatePath(`/educator/classes/${classId}`);
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

  const { data: candidates } = await supabase
    .from("video_placements")
    .select("video_id, subtopics!inner(topic_id)")
    .eq("subtopics.topic_id", topicId);
  const candidateIds = [
    ...new Set(((candidates ?? []) as Array<{ video_id: string }>).map((row) => row.video_id)),
  ];

  const { error } = await supabase.from("topics").delete().eq("id", topicId);
  if (error) return { error: error.message };

  await gcOrphanedVideos(supabase, candidateIds);

  revalidatePath(`/educator/classes/${classId}`);
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

  revalidatePath(`/educator/classes/${classId}`);
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

  revalidatePath(`/educator/classes/${classId}`);
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

  const { data: candidates } = await supabase
    .from("video_placements")
    .select("video_id")
    .eq("subtopic_id", subtopicId);
  const candidateIds = [
    ...new Set(((candidates ?? []) as Array<{ video_id: string }>).map((row) => row.video_id)),
  ];

  const { error } = await supabase.from("subtopics").delete().eq("id", subtopicId);
  if (error) return { error: error.message };

  await gcOrphanedVideos(supabase, candidateIds);

  revalidatePath(`/educator/classes/${classId}`);
  return { ok: true };
}

/**
 * Persists the canonical ordered membership of a subtopic. Every id in
 * orderedVideoIds is written as (subtopic_id = subtopicId, order_index = its
 * position), so this single action covers BOTH in-place reordering and
 * cross-subtopic moves. A video already in the subtopic only has its order_index
 * touched (subtopic_id is unchanged, so internal.protect_video_class_lineage
 * early-exits); a dragged-in video is reparented within the same class, which
 * passes videos_modify_educator_or_admin for both its old and new subtopic and
 * skips the lineage guard (class never changes). order_index has no unique
 * constraint, so the concurrent writes settle to a clean 0..n-1 sequence.
 */
export async function reorderSubtopicVideosAction(
  classId: string,
  subtopicId: string,
  orderedVideoIds: string[],
): Promise<CurriculumActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  if (!(await ownsClass(supabase, classId, auth.profile))) {
    return { error: "You don't have permission to edit this class." };
  }

  const { data: target } = await supabase
    .from("subtopics")
    .select("id, topics!inner(class_id)")
    .eq("id", subtopicId)
    .maybeSingle();
  const targetRow = target as { topics: { class_id: string } } | null;
  if (!targetRow || targetRow.topics.class_id !== classId) {
    return { error: "Subtopic not found in this class." };
  }

  /* Phase A contract: the curriculum board passes VIDEO ids, and every video
     has exactly one placement (no sharing UI yet), so a video maps to a single
     placement in this class. We scope the repoint to placements already inside
     this class. When sharing lands, the board switches to placement ids and
     this action takes placement ids directly; the UNIQUE(video_id, subtopic_id)
     constraint is the integrity backstop in the interim. */
  const { data: classSubs } = await supabase
    .from("subtopics")
    .select("id, topics!inner(class_id)")
    .eq("topics.class_id", classId);
  const classSubtopicIds = ((classSubs ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (classSubtopicIds.length === 0) return { ok: true };

  const results = await Promise.all(
    orderedVideoIds.map((id, index) =>
      supabase
        .from("video_placements")
        .update({ subtopic_id: subtopicId, order_index: index })
        .eq("video_id", id)
        .in("subtopic_id", classSubtopicIds),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { error: failed.error.message };

  revalidatePath(`/educator/classes/${classId}`);
  return { ok: true };
}

export async function renameVideoAction(
  videoId: string,
  classId: string,
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

  revalidatePath(`/educator/classes/${classId}`);
  return { ok: true };
}
