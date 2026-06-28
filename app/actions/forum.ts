"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";
import { FORUM_LIMITS } from "@/lib/forum/limits";
import type { ForumPostType } from "@/lib/types/database";

export interface ForumActionState {
  error?: string;
}

function validateTitle(raw: string): string | { error: string } {
  const title = raw.trim();
  if (title.length < FORUM_LIMITS.titleMin) return { error: `Title must be at least ${FORUM_LIMITS.titleMin} characters.` };
  if (title.length > FORUM_LIMITS.titleMax) return { error: `Title must be ${FORUM_LIMITS.titleMax} characters or fewer.` };
  return title;
}

function validateBody(raw: string, max: number): string | { error: string } {
  const body = raw.trim();
  if (body.length < 1) return { error: "Write something first." };
  if (body.length > max) return { error: `Message must be ${max} characters or fewer.` };
  return body;
}

function revalidateForum(classId: string, postId?: string) {
  revalidatePath(`/class/${classId}/forum`);
  if (postId) revalidatePath(`/class/${classId}/forum/${postId}`);
}

export async function createForumPostAction(input: {
  classId: string;
  type: ForumPostType;
  videoId?: string | null;
  title: string;
  content: string;
}): Promise<{ error?: string; postId?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const title = validateTitle(input.title);
  if (typeof title !== "string") return title;
  const content = validateBody(input.content, FORUM_LIMITS.postBodyMax);
  if (typeof content !== "string") return content;

  const isVideoQa = input.type === "video_qa";
  if (isVideoQa && !input.videoId) return { error: "Pick a lesson for this question." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forum_posts")
    .insert({
      class_id: input.classId,
      author_id: profile.id,
      type: input.type,
      video_id: isVideoQa ? input.videoId : null,
      title,
      content,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidateForum(input.classId);
  if (isVideoQa && input.videoId) revalidatePath(`/lesson/${input.videoId}`);
  return { postId: (data as { id: string }).id };
}

export async function updateForumPostAction(
  classId: string,
  postId: string,
  input: { title: string; content: string },
): Promise<ForumActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const title = validateTitle(input.title);
  if (typeof title !== "string") return title;
  const content = validateBody(input.content, FORUM_LIMITS.postBodyMax);
  if (typeof content !== "string") return content;

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("forum_posts")
    .select("author_id, video_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { error: "Post not found." };

  const row = post as { author_id: string; video_id: string | null };
  if (row.author_id !== profile.id && profile.role !== "admin") {
    return { error: "Only the author can edit this post." };
  }

  const { error } = await supabase.from("forum_posts").update({ title, content }).eq("id", postId);
  if (error) return { error: error.message };

  revalidateForum(classId, postId);
  if (row.video_id) revalidatePath(`/lesson/${row.video_id}`);
  return {};
}

export async function deleteForumPostAction(classId: string, postId: string): Promise<ForumActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { data: post } = await supabase.from("forum_posts").select("video_id").eq("id", postId).maybeSingle();
  const videoId = (post as { video_id: string | null } | null)?.video_id ?? null;

  const { error } = await supabase.from("forum_posts").delete().eq("id", postId);
  if (error) return { error: error.message };

  revalidateForum(classId);
  if (videoId) revalidatePath(`/lesson/${videoId}`);
  return {};
}

export async function setPostResolvedAction(
  classId: string,
  postId: string,
  resolved: boolean,
): Promise<ForumActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { error } = await supabase.from("forum_posts").update({ is_resolved: resolved }).eq("id", postId);
  if (error) return { error: error.message };

  revalidateForum(classId, postId);
  return {};
}

export async function setPostPinnedAction(
  classId: string,
  postId: string,
  pinned: boolean,
): Promise<ForumActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  /* Pinning is reserved to the class educator or an admin (the DB trigger enforces it too). */
  if (profile.role !== "admin") {
    const { data: cls } = await supabase.from("classes").select("educator_id").eq("id", classId).maybeSingle();
    if (!cls || (cls as { educator_id: string | null }).educator_id !== profile.id) {
      return { error: "Only the class educator can pin threads." };
    }
  }

  const { error } = await supabase.from("forum_posts").update({ is_pinned: pinned }).eq("id", postId);
  if (error) return { error: error.message };

  revalidateForum(classId, postId);
  return {};
}

export async function createForumReplyAction(input: {
  classId: string;
  postId: string;
  parentReplyId?: string | null;
  content: string;
  videoId?: string | null;
}): Promise<{ error?: string; replyId?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const content = validateBody(input.content, FORUM_LIMITS.replyMax);
  if (typeof content !== "string") return content;

  const supabase = await createClient();

  if (input.parentReplyId) {
    const { data: parent } = await supabase
      .from("forum_replies")
      .select("post_id")
      .eq("id", input.parentReplyId)
      .maybeSingle();
    if (!parent || (parent as { post_id: string }).post_id !== input.postId) {
      return { error: "That reply no longer exists." };
    }
  }

  const { data, error } = await supabase
    .from("forum_replies")
    .insert({
      post_id: input.postId,
      parent_reply_id: input.parentReplyId ?? null,
      author_id: profile.id,
      content,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidateForum(input.classId, input.postId);
  if (input.videoId) revalidatePath(`/lesson/${input.videoId}`);
  return { replyId: (data as { id: string }).id };
}

export async function updateForumReplyAction(
  classId: string,
  postId: string,
  replyId: string,
  content: string,
): Promise<ForumActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const body = validateBody(content, FORUM_LIMITS.replyMax);
  if (typeof body !== "string") return body;

  const supabase = await createClient();
  const { data: reply } = await supabase.from("forum_replies").select("author_id").eq("id", replyId).maybeSingle();
  if (!reply) return { error: "Reply not found." };
  if ((reply as { author_id: string }).author_id !== profile.id && profile.role !== "admin") {
    return { error: "Only the author can edit this reply." };
  }

  const { error } = await supabase.from("forum_replies").update({ content: body }).eq("id", replyId);
  if (error) return { error: error.message };

  revalidateForum(classId, postId);
  return {};
}

export async function deleteForumReplyAction(
  classId: string,
  postId: string,
  replyId: string,
): Promise<ForumActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { data: children } = await supabase
    .from("forum_replies")
    .select("id")
    .eq("parent_reply_id", replyId)
    .limit(1);

  const hasChildren = (children?.length ?? 0) > 0;
  if (hasChildren) {
    /* Tombstone so the replies nested underneath survive (Reddit-style "[deleted]"). */
    const { error } = await supabase
      .from("forum_replies")
      .update({ is_deleted: true, content: "" })
      .eq("id", replyId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("forum_replies").delete().eq("id", replyId);
    if (error) return { error: error.message };
  }

  revalidateForum(classId, postId);
  return {};
}

export async function togglePostUpvoteAction(
  classId: string,
  postId: string,
): Promise<{ error?: string; upvoted?: boolean }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("forum_post_upvotes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("forum_post_upvotes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", profile.id);
    if (error) return { error: error.message };
    revalidateForum(classId, postId);
    return { upvoted: false };
  }

  const { error } = await supabase.from("forum_post_upvotes").insert({ post_id: postId, user_id: profile.id });
  if (error) return { error: error.message };
  revalidateForum(classId, postId);
  return { upvoted: true };
}

export async function toggleReplyUpvoteAction(
  classId: string,
  postId: string,
  replyId: string,
): Promise<{ error?: string; upvoted?: boolean }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("forum_reply_upvotes")
    .select("reply_id")
    .eq("reply_id", replyId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("forum_reply_upvotes")
      .delete()
      .eq("reply_id", replyId)
      .eq("user_id", profile.id);
    if (error) return { error: error.message };
    revalidateForum(classId, postId);
    return { upvoted: false };
  }

  const { error } = await supabase.from("forum_reply_upvotes").insert({ reply_id: replyId, user_id: profile.id });
  if (error) return { error: error.message };
  revalidateForum(classId, postId);
  return { upvoted: true };
}
