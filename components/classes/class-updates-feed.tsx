import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { AnnouncementWithAuthor } from "@/lib/queries/announcements";
import { AnnouncementCard } from "@/components/announcements/announcement-card";

interface ClassUpdatesFeedProps {
  announcements: AnnouncementWithAuthor[];
  classId: string;
  viewerId: string;
  viewerIsAdmin: boolean;
  educatorName: string;
}

export function ClassUpdatesFeed({ announcements, classId, viewerId, viewerIsAdmin, educatorName }: ClassUpdatesFeedProps) {
  return (
    <div className="order-2 space-y-6 xl:order-none xl:col-span-7">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold">Class Updates</h2>
        <Link href={`/class/${classId}/announcements`} className="group relative text-sm font-medium text-primary flex items-center gap-1 hover:underline after:absolute after:-inset-3 after:content-['']">
          View all
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {announcements.length === 0 ? (
        <Card className="p-8 border border-dashed border-border bg-card/50 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No announcements yet for this class. Updates from {educatorName} will appear here.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {announcements.map((ann) => (
            <AnnouncementCard key={ann.id} announcement={ann} viewerId={viewerId} viewerIsAdmin={viewerIsAdmin} unread={!ann.has_read} />
          ))}
        </div>
      )}
    </div>
  );
}
