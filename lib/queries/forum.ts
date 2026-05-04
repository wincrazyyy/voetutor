import { createClient } from "@/lib/supabase/server";
import type { ForumPost, ForumReply, ProfilePublic } from "@/lib/types/database";

export interface ForumPostListItem extends ForumPost {
  author: ProfilePublic | null;
  reply_count: number;
  video_title: string | null;
}

export async function getForumPostsForClass(classId: string): Promise<ForumPostListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_posts")
    .select(
      "id, class_id, author_id, type, video_id, title, content, upvotes, is_resolved, created_at, updated_at, author:profiles_public!forum_posts_author_id_fkey(id, first_name, last_name, display_name, role, is_approved), videos(id, title)",
    )
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  if (!data) return [];

  const postIds = data.map((p) => (p as { id: string }).id);
  const replyCounts = await getReplyCountsForPosts(postIds);

  return data.map((row) => {
    const r = row as unknown as ForumPost & {
      author: ProfilePublic | null;
      videos: { id: string; title: string } | null;
    };
    return {
      ...r,
      author: r.author,
      video_title: r.videos?.title ?? null,
      reply_count: replyCounts.get(r.id) ?? 0,
    };
  });
}

export async function getForumPostsForVideo(videoId: string): Promise<ForumPostListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_posts")
    .select(
      "id, class_id, author_id, type, video_id, title, content, upvotes, is_resolved, created_at, updated_at, author:profiles_public!forum_posts_author_id_fkey(id, first_name, last_name, display_name, role, is_approved), videos(id, title)",
    )
    .eq("video_id", videoId)
    .order("created_at", { ascending: false });

  if (!data) return [];

  const postIds = data.map((p) => (p as { id: string }).id);
  const replyCounts = await getReplyCountsForPosts(postIds);

  return data.map((row) => {
    const r = row as unknown as ForumPost & {
      author: ProfilePublic | null;
      videos: { id: string; title: string } | null;
    };
    return {
      ...r,
      author: r.author,
      video_title: r.videos?.title ?? null,
      reply_count: replyCounts.get(r.id) ?? 0,
    };
  });
}

async function getReplyCountsForPosts(postIds: string[]): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_replies")
    .select("post_id")
    .in("post_id", postIds);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ post_id: string }>) {
    counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1);
  }
  return counts;
}

export interface ForumReplyWithAuthor extends ForumReply {
  author: ProfilePublic | null;
}

export async function getRepliesForPost(postId: string): Promise<ForumReplyWithAuthor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_replies")
    .select(
      "id, post_id, parent_reply_id, author_id, content, created_at, updated_at, author:profiles_public!forum_replies_author_id_fkey(id, first_name, last_name, display_name, role, is_approved)",
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => {
    const r = row as unknown as ForumReply & { author: ProfilePublic | null };
    return { ...r, author: r.author };
  });
}

export async function getQAThreadsForVideo(videoId: string): Promise<Array<ForumPostListItem & { replies: ForumReplyWithAuthor[] }>> {
  const posts = await getForumPostsForVideo(videoId);
  const withReplies = await Promise.all(
    posts.map(async (post) => ({
      ...post,
      replies: await getRepliesForPost(post.id),
    })),
  );
  return withReplies;
}
