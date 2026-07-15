import { Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { AnnouncementWithAuthor } from "@/lib/queries/announcements";
import { AnnouncementCard } from "@/components/announcements/announcement-card";

interface GlobalUpdatesFeedProps {
  announcements: AnnouncementWithAuthor[];
  viewerId: string;
  viewerIsAdmin: boolean;
}

export function GlobalUpdatesFeed({ announcements, viewerId, viewerIsAdmin }: GlobalUpdatesFeedProps) {
  return (
    <div className="md:col-span-8 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold">Global Updates</h2>
      </div>

      {announcements.length === 0 ? (
        <Card className="p-8 border border-dashed border-border bg-card/50 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No announcements yet. Updates from your educators will appear here.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {announcements.map((ann) => (
            <AnnouncementCard
              key={ann.id}
              announcement={ann}
              viewerId={viewerId}
              viewerIsAdmin={viewerIsAdmin}
              showClassCode
              unread={!ann.has_read}
            />
          ))}
        </div>
      )}
    </div>
  );
}
