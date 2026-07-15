import Link from "next/link";
import { ArrowRight, BookOpen, Flag, GraduationCap, ShieldCheck, UserCheck, Users } from "lucide-react";

import { getPendingEducatorCount } from "@/lib/queries/educator-approvals";
import { getPendingReportCount } from "@/lib/queries/class-reports";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AdminHubPage() {
  const [pendingCount, reportCount] = await Promise.all([
    getPendingEducatorCount(),
    getPendingReportCount(),
  ]);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h1 className="mb-2 flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <ShieldCheck className="w-6 h-6 shrink-0 text-primary sm:w-7 sm:h-7" />
          <span className="min-w-0 break-words">Admin Hub</span>
        </h1>
        <p className="text-muted-foreground">Approve educators, moderate reports, and manage every class on the platform.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6 border-border bg-card shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Pending Educators</span>
              <UserCheck className="w-5 h-5 text-primary" />
            </div>
            <div className="text-3xl font-black">{pendingCount}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {pendingCount === 0 ? "No educators waiting for approval" : `${pendingCount} ${pendingCount === 1 ? "educator" : "educators"} awaiting approval`}
            </p>
          </div>
          <Link href="/approvals" className="mt-4">
            <Button variant="outline" className="w-full justify-between group">
              Review approvals
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </Card>

        <Card className="p-6 border-border bg-card shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Pending Reports</span>
              <Flag className="w-5 h-5 text-primary" />
            </div>
            <div className="text-3xl font-black">{reportCount}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {reportCount === 0 ? "No reports to review" : `${reportCount} ${reportCount === 1 ? "report" : "reports"} awaiting review`}
            </p>
          </div>
          <Link href="/reports" className="mt-4">
            <Button variant="outline" className="w-full justify-between group">
              Review reports
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/educators">
          <Card className="p-5 border-border bg-card shadow-sm flex items-center gap-4 hover:border-primary/40 transition-colors">
            <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-bold">Educator Profiles</div>
              <p className="text-sm text-muted-foreground">View and edit any educator&apos;s public profile</p>
            </div>
          </Card>
        </Link>

        <Link href="/admin/students">
          <Card className="p-5 border-border bg-card shadow-sm flex items-center gap-4 hover:border-primary/40 transition-colors">
            <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-bold">Students</div>
              <p className="text-sm text-muted-foreground">View and remove student accounts</p>
            </div>
          </Card>
        </Link>

        <Link href="/classes">
          <Card className="p-5 border-border bg-card shadow-sm flex items-center gap-4 hover:border-primary/40 transition-colors">
            <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-bold">All Classes</div>
              <p className="text-sm text-muted-foreground">Every class on the platform — search and moderate</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
