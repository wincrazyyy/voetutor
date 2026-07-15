import { redirect } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Flag } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getPendingReports } from "@/lib/queries/class-reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportActions } from "@/components/admin/report-actions";
import { getDisplayName, relativeTime } from "@/lib/utils/format";

export default async function ReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const reports = await getPendingReports();

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="mb-2 flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <Flag className="w-6 h-6 shrink-0 text-primary sm:w-7 sm:h-7" />
          <span className="min-w-0 break-words">Class Reports</span>
        </h1>
        <p className="text-muted-foreground">
          Review user-submitted reports. Unpublishing a class removes it from the marketplace and resolves every pending report against it.
        </p>
      </div>

      {reports.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
          <Flag className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold mb-1">No pending reports</h3>
          <p className="text-sm text-muted-foreground">All caught up.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {reports.map((r) => {
            const reporterName = r.reporter
              ? getDisplayName(r.reporter.first_name, r.reporter.last_name, r.reporter.display_name)
              : "Unknown reporter";
            const classTitle = r.class?.title ?? "(class deleted)";
            const classCode = r.class?.code ?? "—";
            const classIsPublished = r.class?.is_published ?? false;

            return (
              <Card key={r.id} className="p-5 border-border shadow-sm bg-card">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                    <h2 className="min-w-0 break-words text-lg font-bold">{classTitle}</h2>
                    <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
                      {classCode}
                    </Badge>
                    {!classIsPublished && (
                      <Badge variant="secondary" className="text-muted-foreground">
                        Unpublished
                      </Badge>
                    )}
                  </div>
                  {r.class && (
                    <Link
                      href={`/class/${r.class.id}/edit`}
                      className="relative inline-flex w-fit items-center gap-1 text-xs text-muted-foreground after:absolute after:-inset-3 after:content-[''] hover:text-foreground"
                    >
                      View class
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>

                <div className="text-xs text-muted-foreground mb-3">
                  Reported by <span className="font-semibold text-foreground">{reporterName}</span> · {relativeTime(r.created_at)}
                </div>

                <p className="text-sm bg-muted/40 border border-border rounded-md p-3 whitespace-pre-wrap break-words mb-4">
                  {r.reason}
                </p>

                <ReportActions reportId={r.id} classIsPublished={classIsPublished} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
