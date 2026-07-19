import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, ChevronRight, UserCog } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getProfileById } from "@/lib/queries/profile";
import { getStudentProfile } from "@/lib/queries/student-profiles";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { StudentProfileForm } from "@/components/settings/student-profile-form";
import { RemoveAvatarButton } from "@/components/admin/remove-avatar-button";
import { DeleteAccountButton } from "@/components/admin/delete-account-button";
import { deleteStudentAccountAction } from "@/app/actions/educators";
import { getDisplayName, relativeTime } from "@/lib/utils/format";
import type { EnrollmentAccess } from "@/lib/types/database";

interface EnrolledClassRow {
  class_id: string;
  enrolled_at: string;
  access_scope: EnrollmentAccess;
  classes: { id: string; title: string; code: string };
}

export default async function AdminStudentManagePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const target = await getProfileById(studentId);
  if (!target || target.role !== "student") notFound();

  const supabase = await createClient();
  const [studentProfile, enrollmentsRes] = await Promise.all([
    getStudentProfile(studentId),
    supabase
      .from("class_enrollments")
      .select("class_id, enrolled_at, access_scope, classes!inner(id, title, code)")
      .eq("user_id", studentId)
      .order("enrolled_at", { ascending: false }),
  ]);
  const enrollments = (enrollmentsRes.data ?? []) as unknown as EnrolledClassRow[];

  const name = getDisplayName(target.first_name, target.last_name, target.display_name);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
      <div>
        <Link href="/admin/students">
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Students
          </Button>
        </Link>

        <h1 className="mb-2 flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <UserCog className="w-6 h-6 shrink-0 text-primary sm:w-7 sm:h-7" />
          <span className="min-w-0 break-words">Manage Student</span>
        </h1>
        <p className="text-muted-foreground">
          Edit {name}&apos;s account details, moderate their avatar, or delete the account.
        </p>
      </div>

      <Card className="border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <UserAvatar
              avatarUrl={target.avatar_url}
              firstName={target.first_name}
              lastName={target.last_name}
              displayName={target.display_name}
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-words text-lg font-bold text-foreground">{name}</span>
                <Badge variant="outline" className="uppercase tracking-wider">
                  Student
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Joined {relativeTime(target.created_at)}
              </p>
            </div>
          </div>
          {target.avatar_url ? <RemoveAvatarButton studentId={studentId} /> : null}
        </div>
      </Card>

      <Card className="border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-1 text-lg font-bold">Account details</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Changes apply immediately; the student sees them in their own Settings.
        </p>
        <StudentProfileForm
          adminEdit={{ studentId }}
          firstName={target.first_name ?? ""}
          lastName={target.last_name ?? ""}
          whatsappNumber={studentProfile?.whatsapp_number ?? ""}
          school={studentProfile?.school ?? ""}
          schoolYear={studentProfile?.school_year ?? ""}
          targetGrade={studentProfile?.target_grade ?? ""}
        />
      </Card>

      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-bold">Enrolled classes</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Open a class to see this student&apos;s full progress and engagement there.
          </p>
        </div>
        {enrollments.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Not enrolled in any classes.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {enrollments.map((enrollment) => (
              <Link
                key={enrollment.class_id}
                href={`/students/${studentId}?class=${enrollment.class_id}`}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30"
              >
                <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {enrollment.classes.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono uppercase tracking-wider">{enrollment.classes.code}</span>
                    {" · enrolled "}
                    {relativeTime(enrollment.enrolled_at)}
                    {enrollment.access_scope === "scoped" ? " · restricted access" : ""}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="border-destructive/30 bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-1 text-lg font-bold text-destructive">Danger zone</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Deleting this account is permanent and removes everything tied to it.
        </p>
        {target.id !== profile.id ? (
          <DeleteAccountButton
            accountId={target.id}
            accountName={name}
            action={deleteStudentAccountAction}
            description={
              <>
                removes their login, every class enrolment and all lesson progress, their forum
                posts and replies, upvotes, announcement read receipts, and any class reports they
                filed. This cannot be undone.
              </>
            }
          />
        ) : null}
      </Card>
    </div>
  );
}
