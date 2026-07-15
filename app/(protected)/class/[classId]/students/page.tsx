import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById, getClassRoster, getEducatorClassOptions } from "@/lib/queries/classes";
import { getClassInvites } from "@/lib/queries/class-invites";
import { getClassPasses, getRosterAccessMap } from "@/lib/queries/class-access";
import { getCurriculumForClass } from "@/lib/queries/curriculum";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClassStudentsTabs } from "@/components/classes/class-students-tabs";
import { AddStudentCard } from "@/components/classes/add-student-card";
import { ClassRoster } from "@/components/classes/class-roster";
import { ClassInviteManager } from "@/components/classes/class-invite-manager";
import { ClassPassesManager } from "@/components/classes/class-passes-manager";
import type { PickerTopic } from "@/components/classes/pass-items-picker";

export default async function ClassStudentsPage({
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

  const [roster, educatorClasses, invites, passes, accessMap, curriculum] = await Promise.all([
    getClassRoster(classId),
    getEducatorClassOptions(cls.educator_id ?? profile.id),
    getClassInvites(classId),
    getClassPasses(classId),
    getRosterAccessMap(classId),
    getCurriculumForClass(classId, profile.id),
  ]);

  const pendingInviteCount = invites.filter((invite) => invite.status === "pending").length;
  const passOptions = passes.map((pass) => ({ id: pass.id, name: pass.name }));
  const accessRecord = Object.fromEntries(accessMap);

  /* The educator sees the whole curriculum (full-access perimeter), so this tree is the complete
     pick-from set for the pass-contents dialog. */
  const pickerTopics: PickerTopic[] = curriculum.map((topic) => ({
    id: topic.id,
    title: topic.title,
    items: topic.items.map((item) => ({
      kind: item.kind,
      id: item.id,
      title: item.title,
    })),
    subtopics: topic.subtopics.map((subtopic) => ({
      id: subtopic.id,
      title: subtopic.title,
      items: subtopic.items.map((item) => ({
        kind: item.kind,
        id: item.id,
        title: item.title,
      })),
    })),
  }));

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
            <Users className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
            <span className="min-w-0 break-words">Manage Students</span>
          </h1>
          <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
            {cls.code}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Add students to <span className="font-medium text-foreground">{cls.title}</span>, organise
          the roster, send invite links, and manage access passes.
        </p>
      </div>

      <ClassStudentsTabs
        studentCount={roster.length}
        pendingInviteCount={pendingInviteCount}
        passCount={passes.length}
        roster={
          <>
            <AddStudentCard classId={cls.id} passes={passOptions} />
            <ClassRoster
              classId={cls.id}
              roster={roster}
              otherClasses={educatorClasses.filter((c) => c.id !== cls.id)}
              accessMap={accessRecord}
              passes={passOptions}
            />
          </>
        }
        invites={
          <>
            <p className="text-sm text-muted-foreground">
              Generate single-use invite links for{" "}
              <span className="font-medium text-foreground">{cls.title}</span>. A student who opens
              their link signs up (or signs in) and is enrolled automatically.
            </p>
            <ClassInviteManager classId={cls.id} invites={invites} passes={passOptions} />
          </>
        }
        passes={
          <ClassPassesManager classId={cls.id} passes={passes} topics={pickerTopics} />
        }
      />
    </div>
  );
}
