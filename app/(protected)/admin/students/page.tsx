import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { StudentsList } from "@/components/admin/students-list";
import { getCurrentProfile } from "@/lib/queries/profile";
import { getAllStudents } from "@/lib/queries/educator-approvals";

export default async function AdminStudentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const students = await getAllStudents();

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      <div>
        <h1 className="mb-2 flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <GraduationCap className="w-6 h-6 shrink-0 text-primary sm:w-7 sm:h-7" />
          <span className="min-w-0 break-words">Students</span>
        </h1>
        <p className="text-muted-foreground">
          View and remove student accounts. {students.length}{" "}
          {students.length === 1 ? "student" : "students"} on the platform.
        </p>
      </div>
      <StudentsList students={students} currentUserId={profile.id} />
    </div>
  );
}
