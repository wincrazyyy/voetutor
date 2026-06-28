import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById } from "@/lib/queries/classes";
import { getAnnouncementById } from "@/lib/queries/announcements";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnnouncementForm } from "@/components/educator/announcement-form";

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ classId: string; announcementId: string }>;
}) {
  const { classId, announcementId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const cls = await getClassById(classId);
  if (!cls) notFound();

  const announcement = await getAnnouncementById(announcementId);
  if (!announcement || announcement.class_id !== classId) notFound();

  const canManage = profile.role === "admin" || announcement.author_id === profile.id;
  if (!canManage) redirect(`/class/${classId}`);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
      <div>
        <Link href={`/class/${classId}`}>
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Class
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Megaphone className="w-7 h-7 text-primary" />
            Edit Announcement
          </h1>
          <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
            {cls.code}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Editing an announcement in <span className="font-semibold text-foreground">{cls.title}</span>.
        </p>
      </div>

      <AnnouncementForm classId={classId} authorId={profile.id} announcement={announcement} />
    </div>
  );
}
