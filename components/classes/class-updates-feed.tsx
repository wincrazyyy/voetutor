import Link from "next/link";
import { ExternalLink, Image as ImageIcon, Inbox, Megaphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnnouncementWithAuthor } from "@/lib/queries/announcements";
import { relativeTime } from "@/lib/utils/format";

interface ClassUpdatesFeedProps {
  announcements: AnnouncementWithAuthor[];
  educator: {
    name: string;
    initials: string;
  };
}

export function ClassUpdatesFeed({ announcements, educator }: ClassUpdatesFeedProps) {
  return (
    <div className="xl:col-span-7 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold">Class Updates</h2>
      </div>

      {announcements.length === 0 ? (
        <Card className="p-8 border border-dashed border-border bg-card/50 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No announcements yet for this class. Updates from {educator.name} will appear here.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {announcements.map((ann) => {
            const isImportant = ann.type === "important";
            const isEvent = ann.type === "event";

            return (
              <Card
                key={ann.id}
                className={`p-6 bg-card border shadow-sm transition-all hover:shadow-md ${isImportant ? "border-primary/30 ring-1 ring-primary/10" : "border-border"}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {educator.initials}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-foreground">{educator.name}</div>
                      <div className="text-xs text-muted-foreground font-medium">{relativeTime(ann.created_at)}</div>
                    </div>
                  </div>
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

                <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-primary" />
                  {ann.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{ann.content}</p>

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

                {ann.image_url && (
                  <div className="mt-4 rounded-xl border border-border bg-muted/20 flex flex-col items-center justify-center aspect-video overflow-hidden">
                    <ImageIcon className="w-10 h-10 text-muted-foreground/30 mb-2" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                      {ann.image_alt ?? "Attachment"}
                    </span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
