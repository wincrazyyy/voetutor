"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Reply as ReplyIcon, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FORUM_LIMITS } from "@/lib/forum/limits";
import { getDisplayName, relativeTime } from "@/lib/utils/format";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ForumReplyWithAuthor } from "@/lib/queries/forum";
import { ForumUpvoteButton } from "@/components/forum/forum-upvote-button";
import { ForumReplyComposer } from "@/components/forum/forum-reply-composer";
import { ForumMarkdown } from "@/components/forum/forum-markdown";
import { MarkdownEditor } from "@/components/forum/markdown-editor";
import { deleteForumReplyAction, updateForumReplyAction } from "@/app/actions/forum";

interface ForumReplyTreeProps {
  classId: string;
  postId: string;
  postAuthorId: string;
  replies: ForumReplyWithAuthor[];
  currentUserId: string;
  isAdmin: boolean;
  canModerate: boolean;
  /** The class owner's id — replies by this person get the "Educator" badge. Admin status is never shown. */
  classEducatorId: string | null;
  videoId?: string | null;
}

export function ForumReplyTree(props: ForumReplyTreeProps) {
  const { replies } = props;

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, ForumReplyWithAuthor[]>();
    for (const r of replies) {
      const key = r.parent_reply_id;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [replies]);

  const roots = childrenOf.get(null) ?? [];

  if (replies.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No replies yet. Be the first to respond.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {roots.map((r) => (
        <ReplyNode key={r.id} reply={r} depth={0} childrenOf={childrenOf} {...props} />
      ))}
    </div>
  );
}

interface ReplyNodeProps extends ForumReplyTreeProps {
  reply: ForumReplyWithAuthor;
  depth: number;
  childrenOf: Map<string | null, ForumReplyWithAuthor[]>;
}

function ReplyNode({
  reply,
  depth,
  childrenOf,
  classId,
  postId,
  postAuthorId,
  currentUserId,
  isAdmin,
  canModerate,
  classEducatorId,
  videoId,
}: ReplyNodeProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(reply.content);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const children = childrenOf.get(reply.id) ?? [];
  const isAuthor = reply.author_id === currentUserId;
  const canEdit = (isAuthor || isAdmin) && !reply.is_deleted;
  const canDelete = (isAuthor || canModerate) && !reply.is_deleted;
  const isOP = reply.author_id === postAuthorId;
  const isClassEducator = Boolean(classEducatorId) && reply.author_id === classEducatorId;
  const edited = !reply.is_deleted && new Date(reply.updated_at).getTime() - new Date(reply.created_at).getTime() > 2000;

  const authorName = reply.is_deleted
    ? "[deleted]"
    : getDisplayName(reply.author?.first_name ?? null, reply.author?.last_name ?? null, reply.author?.display_name ?? null);
  const saveEdit = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateForumReplyAction(classId, postId, reply.id, draft);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  const doDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteForumReplyAction(classId, postId, reply.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setConfirmDelete(false);
      router.refresh();
    });
  };

  const indented = depth > 0 && depth <= FORUM_LIMITS.maxVisualNestingDepth;

  return (
    <div className={cn(indented && "border-l border-border/60 pl-2 sm:border-l-2 sm:pl-4")}>
      <div className="flex gap-2">
        {!reply.is_deleted && (
          <div className="hidden shrink-0 pt-0.5 sm:block">
            <ForumUpvoteButton
              classId={classId}
              postId={postId}
              replyId={reply.id}
              initialCount={reply.upvotes}
              initialUpvoted={reply.has_upvoted}
              size="sm"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {reply.is_deleted ? (
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-primary/10 text-[9px] font-bold text-primary">
                –
              </div>
            ) : (
              <UserAvatar
                avatarUrl={reply.author?.avatar_url ?? null}
                firstName={reply.author?.first_name ?? null}
                lastName={reply.author?.last_name ?? null}
                displayName={reply.author?.display_name ?? null}
                size={20}
              />
            )}
            <span className={cn("min-w-0 max-w-full truncate font-semibold", reply.is_deleted ? "text-muted-foreground italic" : "text-foreground")}>
              {authorName}
            </span>
            {!reply.is_deleted && isOP && (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-transparent text-[11px] uppercase tracking-wider font-bold pointer-events-none sm:text-[9px]">
                OP
              </Badge>
            )}
            {!reply.is_deleted && isClassEducator && (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-transparent text-[11px] uppercase tracking-wider font-bold pointer-events-none sm:text-[9px]">
                Educator
              </Badge>
            )}
            <span className="flex items-center gap-2">
              <span>•</span>
              <span>{relativeTime(reply.created_at)}</span>
              {edited && <span className="italic">(edited)</span>}
            </span>
          </div>

          {editing ? (
            <div className="mt-2 flex flex-col gap-2">
              <MarkdownEditor value={draft} onChange={setDraft} minRows={3} uploaderId={currentUserId} />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(reply.content); }} disabled={pending}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={saveEdit} loading={pending} disabled={draft.trim().length === 0} loadingText="Saving…">
                  Save
                </Button>
              </div>
            </div>
          ) : reply.is_deleted ? (
            <p className="mt-1 text-sm italic text-muted-foreground">[deleted]</p>
          ) : (
            <div className="mt-1">
              <ForumMarkdown content={reply.content} />
            </div>
          )}

          {!editing && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {!reply.is_deleted && (
                <div className="sm:hidden">
                  <ForumUpvoteButton
                    classId={classId}
                    postId={postId}
                    replyId={reply.id}
                    initialCount={reply.upvotes}
                    initialUpvoted={reply.has_upvoted}
                    size="sm"
                  />
                </div>
              )}
              {!reply.is_deleted && (
                <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setReplying((v) => !v)}>
                  <ReplyIcon className="w-3.5 h-3.5" />
                  Reply
                </Button>
              )}
              {canEdit && (
                <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => { setEditing(true); setDraft(reply.content); }}>
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </Button>
              )}
              {canDelete && !confirmDelete && (
                <Button type="button" variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </Button>
              )}
              {canDelete && confirmDelete && (
                <span className="flex flex-wrap items-center gap-1 text-xs">
                  <span className="text-muted-foreground">Delete?</span>
                  <Button type="button" variant="ghost" size="xs" className="text-destructive" onClick={doDelete} loading={pending}>
                    Yes
                  </Button>
                  <Button type="button" variant="ghost" size="xs" onClick={() => setConfirmDelete(false)} disabled={pending}>
                    No
                  </Button>
                </span>
              )}
            </div>
          )}

          {error && !editing && <p className="mt-1 text-xs text-destructive">{error}</p>}

          {replying && (
            <div className="mt-2">
              <ForumReplyComposer
                classId={classId}
                postId={postId}
                parentReplyId={reply.id}
                videoId={videoId}
                uploaderId={currentUserId}
                autoFocus
                compact
                placeholder={`Reply to ${authorName}…`}
                onDone={() => setReplying(false)}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}

          {children.length > 0 && (
            <div className="mt-3 flex flex-col gap-3">
              {children.map((child) => (
                <ReplyNode
                  key={child.id}
                  reply={child}
                  depth={depth + 1}
                  childrenOf={childrenOf}
                  classId={classId}
                  postId={postId}
                  postAuthorId={postAuthorId}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  canModerate={canModerate}
                  classEducatorId={classEducatorId}
                  videoId={videoId}
                  replies={[]}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
