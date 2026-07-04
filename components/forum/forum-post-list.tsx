import Link from "next/link";
import { MessageSquare, MessageCircle, PlayCircle, CheckCircle2, Inbox, Pin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ForumPostListItem } from "@/lib/queries/forum";
import { getDisplayName, relativeTime } from "@/lib/utils/format";
import { UserAvatar } from "@/components/ui/user-avatar";
import { stripMarkdown } from "@/lib/forum/strip-markdown";
import { ForumUpvoteButton } from "@/components/forum/forum-upvote-button";

interface ForumPostListProps {
  posts: ForumPostListItem[];
  classId: string;
  /** The class owner's id — authored posts by this person get the "Educator" badge. */
  classEducatorId: string | null;
  emptyHint?: string;
}

export function ForumPostList({ posts, classId, classEducatorId, emptyHint }: ForumPostListProps) {
  if (posts.length === 0) {
    return (
      <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
        <Inbox className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-bold mb-1">No discussions yet</h3>
        <p className="text-sm text-muted-foreground">{emptyHint ?? "Be the first to start a thread for this class."}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => {
        const authorName = getDisplayName(
          post.author?.first_name ?? null,
          post.author?.last_name ?? null,
          post.author?.display_name ?? null,
        );
        return (
          <Card
            key={post.id}
            className={cn(
              "p-0 bg-card shadow-sm hover:border-primary/30 transition-colors overflow-hidden",
              post.is_pinned ? "border-primary/40 bg-primary/[0.02]" : "border-border",
            )}
          >
            <div className="flex">
              <div className="w-14 bg-muted/20 flex flex-col items-center py-4 border-r border-border/50 shrink-0">
                <ForumUpvoteButton
                  classId={classId}
                  postId={post.id}
                  initialCount={post.upvotes}
                  initialUpvoted={post.has_upvoted}
                />
              </div>

              <div className="flex-1 p-4 sm:p-5 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
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

                {post.is_pinned && (
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary mb-1">
                    <Pin className="w-3 h-3" />
                    Pinned
                  </div>
                )}
                <Link href={`/class/${classId}/forum/${post.id}`} className="group block">
                  <h3 className="text-base sm:text-lg font-bold mb-1.5 leading-tight text-foreground group-hover:text-primary transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">{stripMarkdown(post.content)}</p>
                </Link>

                <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                  <Link
                    href={`/class/${classId}/forum/${post.id}`}
                    className="flex items-center gap-1.5 bg-muted/30 px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {post.reply_count} {post.reply_count === 1 ? "Reply" : "Replies"}
                  </Link>

                  {post.is_resolved && (
                    <span className="flex items-center gap-1.5 text-emerald-600 bg-emerald-500/10 px-2.5 py-1.5 rounded-md">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Answered
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
