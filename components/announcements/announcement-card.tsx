"use client";

import Link from "next/link";
import { ExternalLink, Megaphone, Ticket } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnnouncementWithAuthor } from "@/lib/queries/announcements";
import { getDisplayName, relativeTime } from "@/lib/utils/format";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ForumMarkdown } from "@/components/forum/forum-markdown";
import { AnnouncementActions } from "@/components/announcements/announcement-actions";
import { EventDate } from "@/components/announcements/event-date";

interface AnnouncementCardProps {
  announcement: AnnouncementWithAuthor;
  viewerId: string;
  viewerIsAdmin: boolean;
  /** Global feed shows the originating class code; a single-class feed doesn't. */
  showClassCode?: boolean;
  /** Show a "New" marker (the viewer hasn't read this one yet). */
  unread?: boolean;
}

export function AnnouncementCard({ announcement: ann, viewerId, viewerIsAdmin, showClassCode = false, unread = false }: AnnouncementCardProps) {
  const isImportant = ann.type === "important";
  const isEvent = ann.type === "event";
  const canManage = viewerIsAdmin || ann.author_id === viewerId;
  const edited = new Date(ann.updated_at).getTime() - new Date(ann.created_at).getTime() > 2000;

  const authorName = getDisplayName(
    ann.author?.first_name ?? null,
    ann.author?.last_name ?? null,
    ann.author?.display_name ?? null,
  );
  return (
    <Card id={`announcement-${ann.id}`} className={cn("scroll-mt-24 p-6 bg-card border shadow-sm transition-all hover:shadow-md", isImportant ? "border-primary/30 ring-1 ring-primary/10" : "border-border")}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />}
          <UserAvatar
            avatarUrl={ann.author?.avatar_url ?? null}
            firstName={ann.author?.first_name ?? null}
            lastName={ann.author?.last_name ?? null}
            displayName={ann.author?.display_name ?? null}
            size={40}
          />
          <div>
            <div className="font-bold text-sm text-foreground flex items-center gap-2">
              {authorName}
              {showClassCode && ann.class_code && (
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {ann.class_code}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-medium mt-0.5">
              {relativeTime(ann.created_at)}
              {edited && <span className="italic"> · edited</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {ann.pass_id && (
            <Badge
              variant="secondary"
              className="bg-gold/10 text-gold border-transparent pointer-events-none max-w-48 gap-1"
              title={
                canManage
                  ? `Sent only to holders of this pass`
                  : `Sent to holders of this pass (includes you)`
              }
            >
              <Ticket className="h-3 w-3 shrink-0" />
              <span className="truncate">{ann.pass_name ?? "Pass"}</span>
            </Badge>
          )}
          {isImportant && (
            <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/10 border-transparent pointer-events-none">
              Important
            </Badge>
          )}
          {isEvent && (
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-transparent pointer-events-none">
              Event
            </Badge>
          )}
        </div>
      </div>

      <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-primary" />
        {ann.title}
      </h3>
      {isEvent && ann.event_at && (
        <div className="mb-3">
          <EventDate at={ann.event_at} />
        </div>
      )}
      <ForumMarkdown content={ann.content} className="text-muted-foreground" />

      {ann.link_url && (
        <Link
          href={ann.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors group"
        >
          <div className="p-2 bg-background rounded-md text-primary group-hover:bg-primary/10 transition-colors shadow-sm">
            <ExternalLink className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors flex-1 truncate">
            {ann.link_title ?? ann.link_url}
          </span>
        </Link>
      )}

      {canManage && (
        <div className="mt-4 flex justify-end border-t border-border/50 pt-3">
          <AnnouncementActions classId={ann.class_id} announcementId={ann.id} />
        </div>
      )}
    </Card>
  );
}
