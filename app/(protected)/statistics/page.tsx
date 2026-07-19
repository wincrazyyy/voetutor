import Link from "next/link";
import { ArrowRight, BarChart3, GraduationCap, ShieldCheck } from "lucide-react";

import { requireEducatorPage } from "@/lib/tiers/gate";
import { getClassesForEducator } from "@/lib/queries/educator";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Top-level Statistics hub (IA restructure v2): the classes the viewer teaches, each card linking
 * into the per-class statistics at /statistics/[classId]. Premium-gated like the rest of the
 * teaching surface; admins pass (they are always premium) but own no classes, so they land on the
 * empty state pointing at the admin console.
 */
export default async function StatisticsHubPage() {
  const access = await requireEducatorPage({ premium: true });
  const classes = await getClassesForEducator(access.profile.id);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h1 className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl mb-2">
          <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
          <span className="min-w-0 break-words">Statistics</span>
        </h1>
        <p className="text-muted-foreground">
          Engagement and progress metrics for each class you teach.
        </p>
      </div>

      {classes.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
          <GraduationCap className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold mb-1">No classes yet</h3>
          <p className="text-sm text-muted-foreground">
            Class statistics appear here once you have classes with enrolled students.
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
        <div className="grid gap-5 md:grid-cols-2">
          {classes.map((cls) => (
            <Link key={cls.id} href={`/statistics/${cls.id}`} className="group flex">
              <Card className="flex w-full flex-col gap-0 overflow-hidden border border-border py-0 shadow-sm hover:shadow-md transition-shadow bg-card relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
                <div className="p-5 flex-1 mt-2">
                  <div className="flex items-start justify-between mb-3 gap-4">
                    <h3 className="min-w-0 break-words text-lg font-bold leading-tight">{cls.title}</h3>
                    <Badge
                      variant="secondary"
                      className="text-xs sm:text-[10px] font-bold tracking-wider uppercase text-muted-foreground bg-muted shrink-0"
                    >
                      {cls.code}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground mt-4">
                    <div className="bg-muted/30 rounded-md p-2 text-center">
                      <div className="text-foreground font-bold text-base">{cls.student_count}</div>
                      <div>Students</div>
                    </div>
                    <div className="bg-muted/30 rounded-md p-2 text-center">
                      <div className="text-foreground font-bold text-base">{cls.video_count}</div>
                      <div>Videos</div>
                    </div>
                    <div className="bg-muted/30 rounded-md p-2 text-center">
                      <div className="text-foreground font-bold text-base">{cls.unanswered_post_count}</div>
                      <div>Open Q&A</div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted/20 border-t border-border">
                  <div className="flex h-10 w-full items-center justify-between rounded-md px-4 text-sm font-semibold transition-colors group-hover:bg-primary/5 group-hover:text-primary">
                    View Statistics
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
