import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById } from "@/lib/queries/classes";
import { getForumPostById, getRepliesForPost } from "@/lib/queries/forum";
import { Button } from "@/components/ui/button";
import { ForumPostCard } from "@/components/forum/forum-post-card";
import { ForumReplyComposer } from "@/components/forum/forum-reply-composer";
import { ForumReplyTree } from "@/components/forum/forum-reply-tree";
import { ForumRealtime } from "@/components/forum/forum-realtime";

export default async function ForumThreadPage({
  params,
}: {
  params: Promise<{ classId: string; postId: string }>;
}) {
  const { classId, postId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const cls = await getClassById(classId);
  if (!cls) notFound();

  const post = await getForumPostById(postId, profile.id);
  if (!post || post.class_id !== classId) notFound();

  const replies = await getRepliesForPost(postId, profile.id);

  const isAdmin = profile.role === "admin";
  const canModerate = isAdmin || cls.educator_id === profile.id;
  const replyCount = replies.filter((r) => !r.is_deleted).length;

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
      <ForumRealtime classId={classId} postId={postId} />
      <Link href={`/class/${classId}/forum`}>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Forum
        </Button>
      </Link>

      <ForumPostCard
        classId={classId}
        post={post}
        currentUserId={profile.id}
        isAdmin={isAdmin}
        canModerate={canModerate}
        classEducatorId={cls.educator_id}
      />

      <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          {replyCount} {replyCount === 1 ? "Reply" : "Replies"}
        </h2>

        <ForumReplyComposer classId={classId} postId={postId} videoId={post.video_id} placeholder="Add to the discussion…" />

        <ForumReplyTree
          classId={classId}
          postId={postId}
          postAuthorId={post.author_id}
          replies={replies}
          currentUserId={profile.id}
          isAdmin={isAdmin}
          canModerate={canModerate}
          classEducatorId={cls.educator_id}
          videoId={post.video_id}
        />
      </div>
    </div>
  );
}
