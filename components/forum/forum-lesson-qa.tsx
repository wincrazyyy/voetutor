"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, MessageSquare, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FORUM_LIMITS } from "@/lib/forum/limits";
import { getDisplayName, relativeTime } from "@/lib/utils/format";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { ForumPostListItem, ForumReplyWithAuthor } from "@/lib/queries/forum";
import { ForumReplyComposer } from "@/components/forum/forum-reply-composer";
import { ForumUpvoteButton } from "@/components/forum/forum-upvote-button";
import { ForumMarkdown } from "@/components/forum/forum-markdown";
import { MarkdownEditor } from "@/components/forum/markdown-editor";
import { createForumPostAction } from "@/app/actions/forum";

type QAThread = ForumPostListItem & { replies: ForumReplyWithAuthor[] };

interface ForumLessonQAProps {
  classId: string;
  lessonId: string;
  threads: QAThread[];
  /** The class owner's id — used to badge the educator. Admin status is never surfaced. */
  classEducatorId: string | null;
  /** Current user's id — enables image embeds in the ask/reply composers. */
  currentUserId: string;
}

export function ForumLessonQA({ classId, lessonId, threads, classEducatorId, currentUserId }: ForumLessonQAProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-muted/20 sticky top-0 z-10 flex flex-col gap-3">
        <AskQuestion classId={classId} lessonId={lessonId} uploaderId={currentUserId} />
        <Link href={`/class/${classId}/forum`} className="group self-end">
          <span className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
            View all class discussions
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </Link>
      </div>

      <div className="flex flex-col p-4 gap-6">
        {threads.length > 0 ? (
          threads.map((thread) => (
            <LessonThread
              key={thread.id}
              classId={classId}
              lessonId={lessonId}
              thread={thread}
              classEducatorId={classEducatorId}
              currentUserId={currentUserId}
            />
          ))
        ) : (
          <div className="text-center text-muted-foreground text-sm py-12">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-20" />
            No questions yet for this lesson.
          </div>
        )}
      </div>
    </div>
  );
}

function AskQuestion({ classId, lessonId, uploaderId }: { classId: string; lessonId: string; uploaderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createForumPostAction({
        classId,
        type: "video_qa",
        videoId: lessonId,
        title,
        content,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setTitle("");
      setContent("");
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button size="sm" className="gap-2 self-start" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" />
        Ask a question
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Ask about this lesson</span>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={FORUM_LIMITS.titleMax}
        placeholder="Your question"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <MarkdownEditor value={content} onChange={setContent} minRows={3} placeholder="Add any details…" uploaderId={uploaderId} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending} disabled={title.trim().length < FORUM_LIMITS.titleMin || content.trim().length === 0} loadingText="Posting…">
          Post question
        </Button>
      </div>
    </form>
  );
}

function LessonThread({
  classId,
  lessonId,
  thread,
  classEducatorId,
  currentUserId,
}: {
  classId: string;
  lessonId: string;
  thread: QAThread;
  classEducatorId: string | null;
  currentUserId: string;
}) {
  const [replying, setReplying] = useState(false);

  const studentName = getDisplayName(
    thread.author?.first_name ?? null,
    thread.author?.last_name ?? null,
    thread.author?.display_name ?? null,
  );
  const threadByEducator = Boolean(classEducatorId) && thread.author?.id === classEducatorId;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="shrink-0 pt-0.5">
          <ForumUpvoteButton
            classId={classId}
            postId={thread.id}
            initialCount={thread.upvotes}
            initialUpvoted={thread.has_upvoted}
            size="sm"
          />
        </div>
        <UserAvatar
          avatarUrl={thread.author?.avatar_url ?? null}
          firstName={thread.author?.first_name ?? null}
          lastName={thread.author?.last_name ?? null}
          displayName={thread.author?.display_name ?? null}
          size={32}
        />
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
              {studentName}
              {threadByEducator && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-transparent text-[9px] uppercase tracking-wider font-bold pointer-events-none">
                  Educator
                </Badge>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">{relativeTime(thread.created_at)}</span>
          </div>
          <Link href={`/class/${classId}/forum/${thread.id}`} className="hover:underline">
            <p className="text-sm font-semibold text-foreground leading-relaxed">{thread.title}</p>
          </Link>
          <ForumMarkdown content={thread.content} className="text-muted-foreground" />
        </div>
      </div>

      {thread.replies.length > 0 && (
        <div className="flex flex-col gap-4 pl-8 mt-1 border-l-2 border-muted/50 ml-[15px]">
          {thread.replies.map((reply) => {
            const replyName = reply.is_deleted
              ? "[deleted]"
              : getDisplayName(reply.author?.first_name ?? null, reply.author?.last_name ?? null, reply.author?.display_name ?? null);
            const replyByEducator = Boolean(classEducatorId) && reply.author?.id === classEducatorId;
            return (
              <div key={reply.id} className="flex items-start gap-2">
                {!reply.is_deleted && (
                  <div className="shrink-0 pt-0.5">
                    <ForumUpvoteButton
                      classId={classId}
                      postId={thread.id}
                      replyId={reply.id}
                      initialCount={reply.upvotes}
                      initialUpvoted={reply.has_upvoted}
                      size="sm"
                    />
                  </div>
                )}
                {reply.is_deleted ? (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-primary/10 text-[10px] font-bold text-primary">
                    –
                  </div>
                ) : (
                  <UserAvatar
                    avatarUrl={reply.author?.avatar_url ?? null}
                    firstName={reply.author?.first_name ?? null}
                    lastName={reply.author?.last_name ?? null}
                    displayName={reply.author?.display_name ?? null}
                    size={24}
                  />
                )}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      {replyName}
                      {!reply.is_deleted && replyByEducator && (
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-transparent text-[9px] uppercase tracking-wider font-bold pointer-events-none">
                          Educator
                        </Badge>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{relativeTime(reply.created_at)}</span>
                  </div>
                  {reply.is_deleted ? (
                    <p className="text-sm italic text-muted-foreground">[deleted]</p>
                  ) : (
                    <ForumMarkdown content={reply.content} className="text-muted-foreground" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pl-8">
        {replying ? (
          <ForumReplyComposer
            classId={classId}
            postId={thread.id}
            videoId={lessonId}
            uploaderId={currentUserId}
            autoFocus
            compact
            placeholder={`Reply to ${studentName}…`}
            onDone={() => setReplying(false)}
            onCancel={() => setReplying(false)}
          />
        ) : (
          <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setReplying(true)}>
            Reply
          </Button>
        )}
      </div>
    </div>
  );
}
