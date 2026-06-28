import { createClient } from "@/lib/supabase/server";
import type { ForumPost, ForumReply, ProfilePublic } from "@/lib/types/database";

export type ForumSort = "hot" | "new" | "top" | "unanswered";

export interface ForumPostListItem extends ForumPost {
  author: ProfilePublic | null;
  reply_count: number;
  reply_upvote_sum: number;
  video_title: string | null;
  has_upvoted: boolean;
}

const POST_SELECT =
  "id, class_id, author_id, type, video_id, title, content, upvotes, is_resolved, is_pinned, created_at, updated_at, author:profiles_public!forum_posts_author_id_fkey(id, first_name, last_name, display_name, role, is_approved), videos(id, title)";

const REPLY_SELECT =
  "id, post_id, parent_reply_id, author_id, content, upvotes, is_deleted, created_at, updated_at, author:profiles_public!forum_replies_author_id_fkey(id, first_name, last_name, display_name, role, is_approved)";

type RawPostRow = ForumPost & {
  author: ProfilePublic | null;
  videos: { id: string; title: string } | null;
};

interface ReplyTally {
  count: number;
  upvoteSum: number;
}

/* One query yields BOTH signals the feed needs: the non-deleted reply count and the total upvotes those
   replies received (drives reply_count + the Hot score's RU term). Tombstoned replies are excluded. */
async function getReplyTalliesForPosts(postIds: string[]): Promise<Map<string, ReplyTally>> {
  if (postIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_replies")
    .select("post_id, upvotes, is_deleted")
    .in("post_id", postIds);
  const tallies = new Map<string, ReplyTally>();
  for (const row of (data ?? []) as Array<{ post_id: string; upvotes: number; is_deleted: boolean }>) {
    if (row.is_deleted) continue;
    const t = tallies.get(row.post_id) ?? { count: 0, upvoteSum: 0 };
    t.count += 1;
    t.upvoteSum += row.upvotes ?? 0;
    tallies.set(row.post_id, t);
  }
  return tallies;
}

async function getUserUpvotedPostIds(postIds: string[], userId: string | null): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_post_upvotes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  return new Set(((data ?? []) as Array<{ post_id: string }>).map((r) => r.post_id));
}

async function getUserUpvotedReplyIds(replyIds: string[], userId: string | null): Promise<Set<string>> {
  if (!userId || replyIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_reply_upvotes")
    .select("reply_id")
    .eq("user_id", userId)
    .in("reply_id", replyIds);
  return new Set(((data ?? []) as Array<{ reply_id: string }>).map((r) => r.reply_id));
}

async function decoratePostRows(rows: RawPostRow[], userId: string | null): Promise<ForumPostListItem[]> {
  const postIds = rows.map((r) => r.id);
  const [tallies, upvoted] = await Promise.all([
    getReplyTalliesForPosts(postIds),
    getUserUpvotedPostIds(postIds, userId),
  ]);
  return rows.map((r) => {
    const tally = tallies.get(r.id);
    return {
      ...r,
      author: r.author,
      video_title: r.videos?.title ?? null,
      reply_count: tally?.count ?? 0,
      reply_upvote_sum: tally?.upvoteSum ?? 0,
      has_upvoted: upvoted.has(r.id),
    };
  });
}

/* Hot ranking (researched — see plans/class-forum.md §14). Reddit-style additive shape: a diminishing-
   returns engagement number (log1p of post upvotes, reply count, reply-upvote sum, effort-weighted) plus
   a recency baseline from the post's absolute birth time. Robust at low volume; an old high-vote thread
   can't camp the top because the newcomer baseline rises ~2 engagement-units per day. */
const HOT_EPOCH = 1704067200;
const HOT_RECENCY_SCALE = 43200;
const HOT_WEIGHTS = { post: 1.0, reply: 2.0, replyUpvote: 1.5 };

function hotScore(post: ForumPostListItem): number {
  const engagement =
    HOT_WEIGHTS.post * Math.log1p(post.upvotes) +
    HOT_WEIGHTS.reply * Math.log1p(post.reply_count) +
    HOT_WEIGHTS.replyUpvote * Math.log1p(post.reply_upvote_sum);
  const seconds = Math.floor(new Date(post.created_at).getTime() / 1000);
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  return engagement + (safeSeconds - HOT_EPOCH) / HOT_RECENCY_SCALE;
}

function sortPosts(posts: ForumPostListItem[], sort: ForumSort): ForumPostListItem[] {
  const byNew = (a: ForumPostListItem, b: ForumPostListItem) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  /* Pinned threads always float to the top, regardless of the active sort. */
  const pinnedFirst = (a: ForumPostListItem, b: ForumPostListItem) =>
    (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);

  if (sort === "unanswered") {
    return posts.filter((p) => p.reply_count === 0 && !p.is_resolved).sort((a, b) => pinnedFirst(a, b) || byNew(a, b));
  }
  if (sort === "top") {
    /* Top = the post's own total upvotes (not the Hot blend). */
    return [...posts].sort((a, b) => pinnedFirst(a, b) || b.upvotes - a.upvotes || byNew(a, b));
  }
  if (sort === "hot") {
    return [...posts].sort((a, b) => pinnedFirst(a, b) || hotScore(b) - hotScore(a) || byNew(a, b));
  }
  return [...posts].sort((a, b) => pinnedFirst(a, b) || byNew(a, b));
}

export async function getForumPostsForClass(
  classId: string,
  userId: string | null = null,
  sort: ForumSort = "hot",
): Promise<ForumPostListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_posts")
    .select(POST_SELECT)
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  if (!data) return [];
  const decorated = await decoratePostRows(data as unknown as RawPostRow[], userId);
  return sortPosts(decorated, sort);
}

export async function getForumPostById(
  postId: string,
  userId: string | null = null,
): Promise<ForumPostListItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("forum_posts").select(POST_SELECT).eq("id", postId).maybeSingle();
  if (!data) return null;
  const [decorated] = await decoratePostRows([data as unknown as RawPostRow], userId);
  return decorated ?? null;
}

export async function getForumPostsForVideo(
  videoId: string,
  classId?: string,
  userId: string | null = null,
): Promise<ForumPostListItem[]> {
  const supabase = await createClient();
  /* A shared video can carry Q&A in several classes; scope to one class when
     given so a lesson opened from class A never shows class B's questions. */
  let query = supabase.from("forum_posts").select(POST_SELECT).eq("video_id", videoId);
  if (classId) query = query.eq("class_id", classId);
  const { data } = await query.order("created_at", { ascending: false });

  if (!data) return [];
  return decoratePostRows(data as unknown as RawPostRow[], userId);
}

export interface ForumReplyWithAuthor extends ForumReply {
  author: ProfilePublic | null;
  has_upvoted: boolean;
}

export async function getRepliesForPost(
  postId: string,
  userId: string | null = null,
): Promise<ForumReplyWithAuthor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_replies")
    .select(REPLY_SELECT)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as Array<ForumReply & { author: ProfilePublic | null }>;
  const upvoted = await getUserUpvotedReplyIds(
    rows.map((r) => r.id),
    userId,
  );
  return rows.map((r) => ({ ...r, author: r.author, has_upvoted: upvoted.has(r.id) }));
}

export async function getQAThreadsForVideo(
  videoId: string,
  classId?: string,
  userId: string | null = null,
): Promise<Array<ForumPostListItem & { replies: ForumReplyWithAuthor[] }>> {
  const posts = await getForumPostsForVideo(videoId, classId, userId);
  const withReplies = await Promise.all(
    posts.map(async (post) => ({
      ...post,
      replies: await getRepliesForPost(post.id, userId),
    })),
  );
  return withReplies;
}
