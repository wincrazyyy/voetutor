import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Library } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getAllClassesForAdmin } from "@/lib/queries/admin-classes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminClassesList } from "@/components/admin/admin-classes-list";

export default async function AdminClassesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const classes = await getAllClassesForAdmin();
  const totalPublished = classes.filter((c) => c.is_published).length;
  const totalDrafts = classes.length - totalPublished;
  const totalStudents = classes.reduce((acc, c) => acc + c.student_count, 0);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      <div>
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Admin Hub
          </Button>
        </Link>

        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 mb-2">
          <Library className="w-7 h-7 text-primary" />
          All Classes
        </h1>
        <p className="text-muted-foreground">
          Every class on the platform — published and draft — across all educators.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 border-border bg-card shadow-sm">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Published</div>
          <div className="text-2xl font-black">{totalPublished}</div>
        </Card>
        <Card className="p-5 border-border bg-card shadow-sm">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Drafts</div>
          <div className="text-2xl font-black">{totalDrafts}</div>
        </Card>
        <Card className="p-5 border-border bg-card shadow-sm">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Enrolments</div>
          <div className="text-2xl font-black">{totalStudents}</div>
        </Card>
      </div>

      <AdminClassesList classes={classes} />
    </div>
  );
}
