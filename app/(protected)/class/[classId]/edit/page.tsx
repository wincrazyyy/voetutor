import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Globe, Lock, Trash2 } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById } from "@/lib/queries/classes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ClassForm } from "@/components/educator/class-form";
import { PublishToggle } from "@/components/educator/publish-toggle";
import { DeleteClassButton } from "@/components/classes/delete-class-button";

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role === "educator" && !profile.is_approved) redirect("/pending");
  if (profile.role !== "educator" && profile.role !== "admin") redirect("/dashboard");

  const cls = await getClassById(classId);
  if (!cls) notFound();
  if (profile.role === "educator" && cls.educator_id !== profile.id) redirect("/dashboard");

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
      <div>
        <Link href={`/class/${classId}`}>
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Class
          </Button>
        </Link>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
          <h1 className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
            <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
            <span className="min-w-0 break-words">Class Settings</span>
          </h1>
          <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
            {cls.code}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Update marketplace details and pricing. Publishing makes the class discoverable to students.
        </p>
      </div>

      <Card className="p-5 border-border shadow-sm bg-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            {cls.is_published ? (
              <Globe className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            ) : (
              <Lock className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="font-semibold">
                {cls.is_published ? "Published" : "Draft"}
              </div>
              <p className="text-sm text-muted-foreground">
                {cls.is_published
                  ? "Visible in the student marketplace and accepting enrolments."
                  : "Only you and admins can see this class. Students cannot enrol yet."}
              </p>
            </div>
          </div>
          <PublishToggle classId={cls.id} isPublished={cls.is_published} />
        </div>
      </Card>

      <ClassForm mode="edit" initial={cls} />

      <Card className="p-5 border-destructive/30 bg-destructive/5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <Trash2 className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-destructive">Danger zone</div>
              <p className="text-sm text-muted-foreground">
                Permanently delete this class and everything attached to it: topics, videos, announcements, forum posts, and student enrolments.
              </p>
            </div>
          </div>
          <DeleteClassButton classId={cls.id} classCode={cls.code} classTitle={cls.title} />
        </div>
      </Card>
    </div>
  );
}
