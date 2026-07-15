import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Inbox, Megaphone, Plus } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById } from "@/lib/queries/classes";
import { getAnnouncementsForClass } from "@/lib/queries/announcements";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { MarkAnnouncementsRead } from "@/components/announcements/mark-announcements-read";
import { TableRefresh } from "@/components/realtime/table-refresh";

export default async function ClassAnnouncementsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const cls = await getClassById(classId);
  if (!cls) notFound();

  const announcements = await getAnnouncementsForClass(classId, 100);
  const isAdmin = profile.role === "admin";
  const canPost = isAdmin || cls.educator_id === profile.id;
  const unreadIds = announcements.filter((a) => !a.has_read).map((a) => a.id);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
      <MarkAnnouncementsRead unreadIds={unreadIds} />
      <TableRefresh
        channel={`announcements:class:${classId}`}
        subscriptions={[{ table: "announcements", filter: `class_id=eq.${classId}` }]}
      />

      <div>
        <Link href={`/class/${classId}`}>
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Class
          </Button>
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
                <Megaphone className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
                <span className="min-w-0 break-words">Announcements</span>
              </h1>
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
                {cls.code}
              </Badge>
            </div>
            <p className="text-muted-foreground break-words">Updates and broadcasts for {cls.title}.</p>
          </div>
          {canPost && (
            <Link href={`/class/${classId}/announce`}>
              <Button className="gap-2 shadow-md">
                <Plus className="w-4 h-4" />
                Post Announcement
              </Button>
            </Link>
          )}
        </div>
      </div>

      {announcements.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold mb-1">No announcements yet</h3>
          <p className="text-sm text-muted-foreground">
            {canPost ? "Post the first update for this class." : "Updates from your educator will appear here."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {announcements.map((ann) => (
            <AnnouncementCard
              key={ann.id}
              announcement={ann}
              viewerId={profile.id}
              viewerIsAdmin={isAdmin}
              unread={!ann.has_read}
            />
          ))}
        </div>
      )}
    </div>
  );
}
