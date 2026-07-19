import Link from "next/link";
import { GraduationCap, ShieldCheck, Users } from "lucide-react";

import { requireEducatorPage } from "@/lib/tiers/gate";
import { getStudentsForEducator } from "@/lib/queries/student-insights";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EducatorStudentsList } from "@/components/educator/educator-students-list";

/**
 * Top-level Students hub (IA restructure v2): every student across the viewer's taught classes,
 * deduped, searchable by name, each linking to the cross-class view at /students/[studentId].
 * Premium-gated; admins pass but own no classes, so they land on the empty state pointing at
 * /admin/students.
 */
export default async function StudentsHubPage() {
  const access = await requireEducatorPage({ premium: true });
  const students = await getStudentsForEducator(access.profile.id);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h1 className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl mb-2">
          <Users className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
          <span className="min-w-0 break-words">Students</span>
        </h1>
        <p className="text-muted-foreground">
          Everyone enrolled in your classes — open a student for their full profile, progress, and
          engagement.
        </p>
      </div>

      {students.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
          <GraduationCap className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold mb-1">No students yet</h3>
          <p className="text-sm text-muted-foreground">
            Students appear here once they enrol in one of your classes.
          </p>
          {access.isAdmin && (
            <Link href="/admin/students" className="mt-4 inline-block max-w-full">
              <Button variant="outline" className="gap-2 h-auto whitespace-normal text-center max-w-full">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Manage all students in the Admin console
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <EducatorStudentsList students={students} />
      )}
    </div>
  );
}
