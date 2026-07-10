"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, MessageSquare, Pencil, Pin, PinOff, PlayCircle, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FORUM_LIMITS } from "@/lib/forum/limits";
import { getDisplayName, relativeTime } from "@/lib/utils/format";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ForumPostListItem } from "@/lib/queries/forum";
import { ForumUpvoteButton } from "@/components/forum/forum-upvote-button";
import { ForumMarkdown } from "@/components/forum/forum-markdown";
import { MarkdownEditor } from "@/components/forum/markdown-editor";
import {
  deleteForumPostAction,
  setPostPinnedAction,
  setPostResolvedAction,
  updateForumPostAction,
} from "@/app/actions/forum";

interface ForumPostCardProps {
  classId: string;
  post: ForumPostListItem;
  currentUserId: string;
  isAdmin: boolean;
  canModerate: boolean;
  /** The class owner's id — used to badge the educator (admin status is never surfaced). */
  classEducatorId: string | null;
}

export function ForumPostCard({ classId, post, currentUserId, isAdmin, canModerate, classEducatorId }: ForumPostCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isAuthor = post.author_id === currentUserId;
  const canEdit = isAuthor || isAdmin;
  const canDelete = isAuthor || canModerate;
  const canResolve = isAuthor || canModerate;

  const authorName = getDisplayName(
    post.author?.first_name ?? null,
    post.author?.last_name ?? null,
    post.author?.display_name ?? null,
  );
  const edited = new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 2000;

  const saveEdit = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateForumPostAction(classId, post.id, { title, content });
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  const toggleResolved = () => {
    setError(null);
    startTransition(async () => {
      const res = await setPostResolvedAction(classId, post.id, !post.is_resolved);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  const togglePinned = () => {
    setError(null);
    startTransition(async () => {
      const res = await setPostPinnedAction(classId, post.id, !post.is_pinned);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  const doDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteForumPostAction(classId, post.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(`/class/${classId}/forum`);
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex">
        <div className="w-14 bg-muted/20 flex flex-col items-center py-4 border-r border-border/50 shrink-0">
          <ForumUpvoteButton
            classId={classId}
            postId={post.id}
            initialCount={post.upvotes}
            initialUpvoted={post.has_upvoted}
          />
        </div>

        <div className="flex-1 p-5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserAvatar
                avatarUrl={post.author?.avatar_url ?? null}
                firstName={post.author?.first_name ?? null}
                lastName={post.author?.last_name ?? null}
                displayName={post.author?.display_name ?? null}
                size={20}
              />
              <span className="font-semibold text-foreground">{authorName}</span>
              {classEducatorId && post.author?.id === classEducatorId && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-transparent text-[9px] uppercase tracking-wider font-bold pointer-events-none">
                  Educator
                </Badge>
              )}
              <span>•</span>
              <span>{relativeTime(post.created_at)}</span>
              {edited && <span className="italic">(edited)</span>}
            </div>

            {post.type === "video_qa" && post.video_id ? (
              <Link href={`/lesson/${post.video_id}?from=${post.class_id}`}>
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 transition-colors gap-1.5 text-[10px] cursor-pointer">
                  <PlayCircle className="w-3 h-3" />
                  {post.video_title ?? "Video Q&A"}
                </Badge>
              </Link>
            ) : (
              <Badge variant="secondary" className="bg-muted text-muted-foreground gap-1.5 text-[10px]">
                <MessageSquare className="w-3 h-3" />
                General Discussion
              </Badge>
            )}
          </div>

          {editing ? (
            <div className="flex flex-col gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={FORUM_LIMITS.titleMax}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <MarkdownEditor value={content} onChange={setContent} minRows={6} uploaderId={currentUserId} />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setTitle(post.title); setContent(post.content); }} disabled={pending}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={saveEdit} loading={pending} disabled={title.trim().length < FORUM_LIMITS.titleMin || content.trim().length === 0} loadingText="Saving…">
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 mb-2">
                <h1 className="text-xl font-bold leading-tight text-foreground flex-1">{post.title}</h1>
                {post.is_pinned && (
                  <span className="flex items-center gap-1.5 text-primary bg-primary/10 px-2.5 py-1 rounded-md text-xs font-semibold shrink-0">
                    <Pin className="w-3.5 h-3.5" />
                    Pinned
                  </span>
                )}
                {post.is_resolved && (
                  <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-md text-xs font-semibold shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Answered
                  </span>
                )}
              </div>
              <ForumMarkdown content={post.content} />

              {(canEdit || canDelete || canResolve) && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
                  {canResolve && (
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={toggleResolved} loading={pending}>
                      {post.is_resolved ? <Circle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      {post.is_resolved ? "Mark unresolved" : "Mark resolved"}
                    </Button>
                  )}
                  {canModerate && (
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={togglePinned} loading={pending}>
                      {post.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      {post.is_pinned ? "Unpin" : "Pin"}
                    </Button>
                  )}
                  {canEdit && (
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEditing(true)}>
                      <Pencil className="w-4 h-4" />
                      Edit
                    </Button>
                  )}
                  {canDelete && !confirmDelete && (
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                  )}
                  {canDelete && confirmDelete && (
                    <span className="flex items-center gap-1 text-sm">
                      <span className="text-muted-foreground">Delete this thread?</span>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={doDelete} loading={pending}>
                        Yes, delete
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={pending}>
                        Cancel
                      </Button>
                    </span>
                  )}
                </div>
              )}
              {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
