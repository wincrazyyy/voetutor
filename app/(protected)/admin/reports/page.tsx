import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Flag } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getPendingReports } from "@/lib/queries/class-reports";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportActions } from "@/components/admin/report-actions";
import { getDisplayName, relativeTime } from "@/lib/utils/format";

export default async function AdminReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const reports = await getPendingReports();

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
      <div>
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Admin Hub
          </Button>
        </Link>

        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 mb-2">
          <Flag className="w-7 h-7 text-primary" />
          Class Reports
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
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold">{classTitle}</h2>
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
                      href={`/educator/classes/${r.class.id}/edit`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      View class
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>

                <div className="text-xs text-muted-foreground mb-3">
                  Reported by <span className="font-semibold text-foreground">{reporterName}</span> · {relativeTime(r.created_at)}
                </div>

                <p className="text-sm bg-muted/40 border border-border rounded-md p-3 whitespace-pre-wrap mb-4">
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
