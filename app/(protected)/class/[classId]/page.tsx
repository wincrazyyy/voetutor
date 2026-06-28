import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById } from "@/lib/queries/classes";
import { StudentClassView } from "@/components/classes/student-class-view";
import { EducatorClassManage } from "@/components/educator/educator-class-manage";

/**
 * One URL for a class; the view depends on the viewer. The owning educator (or an admin) gets the
 * management view; everyone else (enrolled students) gets the learning view. Replaces the old split
 * between /classes/[id] (student) and /educator/classes/[id] (educator).
 */
export default async function ClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const cls = await getClassById(classId);
  if (!cls) notFound();

  const isManager = profile.role === "admin" || cls.educator_id === profile.id;
  if (isManager) {
    if (profile.role === "educator" && !profile.is_approved) redirect("/pending");
    return <EducatorClassManage cls={cls} userId={profile.id} />;
  }

  return <StudentClassView cls={cls} userId={profile.id} />;
}
