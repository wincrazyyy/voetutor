import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnnouncementWithAuthor } from "@/lib/queries/announcements";
import { relativeTime } from "@/lib/utils/format";
import { stripMarkdown } from "@/lib/forum/strip-markdown";
import { EventDate } from "@/components/announcements/event-date";

interface AnnouncementsPanelProps {
  classId: string;
  latest: AnnouncementWithAuthor | null;
  hasUnread: boolean;
}

/** Compact class-page panel: previews the latest announcement, lights a dot when something's unread, and
 *  links to the full announcements page. Used on the class management view. */
export function AnnouncementsPanel({ classId, latest, hasUnread }: AnnouncementsPanelProps) {
  return (
    <Card className={cn("relative p-5 shadow-sm bg-card", hasUnread ? "border-primary/30 ring-1 ring-primary/15" : "border-border")}>
      {hasUnread && (
        <span className="absolute top-4 right-4 flex h-2.5 w-2.5" aria-label="Unread announcement">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
      )}

      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-primary" />
        Announcements
      </h2>

      {latest ? (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
            {latest.type === "important" && (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-transparent text-xs sm:text-[10px] pointer-events-none">Important</Badge>
            )}
            {latest.type === "event" && (
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-transparent text-xs sm:text-[10px] pointer-events-none">Event</Badge>
            )}
            <span>{relativeTime(latest.created_at)}</span>
          </div>
          <div className="font-semibold leading-snug mb-1">{latest.title}</div>
          {latest.type === "event" && latest.event_at && (
            <div className="mb-1.5">
              <EventDate at={latest.event_at} />
            </div>
          )}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{stripMarkdown(latest.content)}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-4">No announcements yet for this class.</p>
      )}

      <Link href={`/class/${classId}/announcements`} className="w-full">
        <Button variant="outline" className="w-full justify-between group">
          View all announcements
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Button>
      </Link>
    </Card>
  );
}
