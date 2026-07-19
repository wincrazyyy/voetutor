import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, UserCog, UserRound } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorClassStats, type EducatorClassStats } from "@/lib/queries/educator";
import { getEducatorChipsByIds } from "@/lib/queries/classes";
import { getMyClassAccess, type StudentAccess } from "@/lib/queries/class-access";
import {
  getStudentClassDetail,
  getStudentClassEngagement,
  getStudentClassProgress,
  type StudentClassDetail,
  type StudentClassEngagement,
  type StudentClassProgress,
} from "@/lib/queries/student-insights";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentDetailHeader } from "@/components/educator/student-detail-header";
import { StudentProgressBreakdown } from "@/components/educator/student-progress-breakdown";
import { StudentEngagementPanel } from "@/components/educator/student-engagement-panel";
import { getDisplayName } from "@/lib/utils/format";

const DAY_MS = 86_400_000;

interface SharedClassRef {
  id: string;
  code: string;
  title: string;
  educator_id: string;
}

interface StudentClassTab {
  cls: SharedClassRef;
  detail: StudentClassDetail;
  access: StudentAccess | null;
  progress: StudentClassProgress;
  engagement: StudentClassEngagement;
  stats: EducatorClassStats;
}

/**
 * Derived signals (plan §4E — exact rules, computed from panels A-D). Moved verbatim from the
 * former class-scoped detail page; runs once per shared-class tab.
 */
function deriveSignals(tab: StudentClassTab, studentAccess: StudentAccess): string[] {
  const { detail, progress, engagement, stats } = tab;
  const now = Date.now();
  const enrolledDays = (now - new Date(detail.enrolled_at).getTime()) / DAY_MS;
  const lastActiveAt = [
    progress.last_progress_at,
    engagement.last_forum_activity_at,
    engagement.last_announcement_read_at,
  ]
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop() ?? null;

  const signals: string[] = [];
  if (
    enrolledDays >= 14 &&
    (!lastActiveAt || (now - new Date(lastActiveAt).getTime()) / DAY_MS >= 14)
  ) {
    signals.push("Inactive");
  }
  if (progress.first_activity_at === null && enrolledDays >= 7) {
    signals.push("Never started");
  }
  /* The class average is computed over the FULL curriculum, so it is not comparable to a scoped
     student's accessible-denominator completion %; skip the average-relative badges for them. */
  const comparableToAverage = studentAccess.scope !== "scoped";
  if (
    comparableToAverage &&
    stats.average_completion_rate > 0 &&
    progress.completion_percent <= stats.average_completion_rate - 20
  ) {
    signals.push("Behind class average");
  }
  if (studentAccess.scope === "scoped" && studentAccess.passes.length === 0) {
    signals.push("Restricted · no passes");
  }
  if (
    signals.length === 0 &&
    comparableToAverage &&
    progress.completion_percent >= stats.average_completion_rate
  ) {
    signals.push("On track");
  }
  return signals;
}

/** One shared class's full insight body — the former class-scoped page body, verbatim, plus an
 *  admin-access notice when the viewer is an admin who does not teach this class. */
function ClassInsightBody({
  tab,
  isAdminView,
  educatorName,
}: {
  tab: StudentClassTab;
  isAdminView: boolean;
  educatorName: string | null;
}) {
  const studentAccess = tab.access ?? { scope: tab.detail.access_scope, passes: [] };
  const signals = deriveSignals(tab, studentAccess);

  return (
    <div className="space-y-8">
      {isAdminView && (
        <div className="flex items-start gap-2.5 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div>
            <p className="font-semibold text-foreground">Admin view</p>
            <p className="text-muted-foreground">
              You don&apos;t teach this class — you can see this student&apos;s data here only because
              you&apos;re an admin
              {educatorName ? <>. It&apos;s taught by {educatorName}</> : null}.
            </p>
          </div>
        </div>
      )}

      <StudentDetailHeader detail={tab.detail} access={studentAccess} signals={signals} />

      <StudentProgressBreakdown progress={tab.progress} classAverage={tab.stats.average_completion_rate} />

      <StudentEngagementPanel engagement={tab.engagement} classId={tab.cls.id} />
    </div>
  );
}

/**
 * Cross-class student view (IA restructure v2): one tab per class the viewer shares with the
 * student. The shared-class set comes from RLS on class_enrollments — an educator's read returns
 * only enrollments in classes they teach (enrollments_select_authorized); an admin sees all of the
 * student's classes. Zero visible classes (no shared class, unknown student, or the RPC failing
 * closed) → 404, so nothing leaks. Each tab re-checks the per-class boundary through the
 * get_class_student_detail RPC as defense-in-depth.
 */
export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ class?: string | string[] }>;
}) {
  const [{ studentId }, search] = await Promise.all([params, searchParams]);
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role === "educator" && !profile.is_approved) redirect("/pending");
  if (profile.role !== "educator" && profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: enrollRows } = await supabase
    .from("class_enrollments")
    .select("class_id, classes!inner(id, code, title, educator_id)")
    .eq("user_id", studentId);
  const sharedClasses = ((enrollRows ?? []) as unknown as Array<{
    class_id: string;
    classes: SharedClassRef;
  }>)
    .map((row) => row.classes)
    .sort((a, b) => a.title.localeCompare(b.title));
  if (sharedClasses.length === 0) notFound();

  const tabData = await Promise.all(
    sharedClasses.map(async (cls) => {
      const [detail, access, progress, engagement, stats] = await Promise.all([
        getStudentClassDetail(cls.id, studentId),
        getMyClassAccess(cls.id, studentId),
        getStudentClassProgress(cls.id, studentId),
        getStudentClassEngagement(cls.id, studentId),
        getEducatorClassStats(cls.id),
      ]);
      return { cls, detail, access, progress, engagement, stats };
    }),
  );
  const tabs = tabData.filter((tab): tab is StudentClassTab => tab.detail !== null);
  if (tabs.length === 0) notFound();

  const first = tabs[0];
  const name = getDisplayName(
    first.detail.first_name,
    first.detail.last_name,
    first.detail.display_name,
  );
  const requested = typeof search.class === "string" ? search.class : undefined;
  const defaultTab =
    requested && tabs.some((tab) => tab.cls.id === requested) ? requested : first.cls.id;

  const isAdmin = profile.role === "admin";
  /* Tabs the viewer sees purely by admin override (they are not the class educator). Educators only
     ever see classes they teach (class_enrollments RLS), so this is always empty for them — the
     "admin view" notice is admin-only. */
  const adminViewClassIds = new Set(
    isAdmin ? tabs.filter((tab) => tab.cls.educator_id !== profile.id).map((tab) => tab.cls.id) : [],
  );
  const educatorNameById = new Map<string, string>();
  if (adminViewClassIds.size > 0) {
    const educatorIds = [
      ...new Set(tabs.filter((tab) => adminViewClassIds.has(tab.cls.id)).map((tab) => tab.cls.educator_id)),
    ];
    const chips = await getEducatorChipsByIds(educatorIds);
    for (const [id, chip] of chips) {
      educatorNameById.set(id, getDisplayName(chip.first_name, chip.last_name, chip.display_name));
    }
  }

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Link href="/students">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Students
            </Button>
          </Link>
          {profile.role === "admin" && (
            <Link href={`/admin/students/${studentId}`} className="ml-auto">
              <Button variant="outline" size="sm" className="gap-2">
                <UserCog className="w-4 h-4" />
                Edit account
              </Button>
            </Link>
          )}
        </div>

        <h1 className="mb-2 flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <UserRound className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
          <span className="min-w-0 break-words">{name}</span>
        </h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? `Profile, progress, and engagement across this student's ${tabs.length === 1 ? "class" : "classes"}.`
            : `Profile, progress, and engagement across the ${tabs.length === 1 ? "class" : "classes"} you share with this student.`}
        </p>
      </div>

      {tabs.length === 1 ? (
        <ClassInsightBody
          tab={first}
          isAdminView={adminViewClassIds.has(first.cls.id)}
          educatorName={educatorNameById.get(first.cls.educator_id) ?? null}
        />
      ) : (
        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full justify-start sm:w-fit">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.cls.id} value={tab.cls.id} className="max-w-[14rem] shrink-0 gap-1.5">
                {adminViewClassIds.has(tab.cls.id) && (
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-gold" />
                )}
                <span className="truncate">{tab.cls.title}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.cls.id} value={tab.cls.id} className="mt-4">
              <ClassInsightBody
                tab={tab}
                isAdminView={adminViewClassIds.has(tab.cls.id)}
                educatorName={educatorNameById.get(tab.cls.educator_id) ?? null}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
