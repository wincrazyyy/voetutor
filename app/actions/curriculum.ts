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
 * Best-effort deletion of Cloudflare videos. A Postgres ON DELETE CASCADE
 * removes the videos rows but never reaches Cloudflare, so descendant Stream
 * videos must be reaped explicitly when a topic or subtopic is deleted.
 */
async function reapCloudflareVideos(rows: unknown): Promise<void> {
  const uids = ((rows ?? []) as Array<{ cloudflare_uid: string | null }>)
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
    .insert({ class_id: classId, title: parsed, order_index: orderIndex });
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

  const { data: videoRows } = await supabase
    .from("videos")
    .select("cloudflare_uid, subtopics!inner(topic_id)")
    .eq("subtopics.topic_id", topicId);

  const { error } = await supabase.from("topics").delete().eq("id", topicId);
  if (error) return { error: error.message };

  await reapCloudflareVideos(videoRows);

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

  const { data: videoRows } = await supabase
    .from("videos")
    .select("cloudflare_uid")
    .eq("subtopic_id", subtopicId);

  const { error } = await supabase.from("subtopics").delete().eq("id", subtopicId);
  if (error) return { error: error.message };

  await reapCloudflareVideos(videoRows);

  revalidatePath(`/educator/classes/${classId}`);
  return { ok: true };
}
