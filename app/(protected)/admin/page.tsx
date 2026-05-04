import Link from "next/link";
import { ArrowRight, ShieldCheck, UserCheck } from "lucide-react";

import { getPendingEducatorCount } from "@/lib/queries/educator-approvals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AdminHubPage() {
  const pendingCount = await getPendingEducatorCount();

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-primary" />
          Admin Hub
        </h1>
        <p className="text-muted-foreground">Approve educators and manage platform-wide settings.</p>
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
          <Link href="/admin/educators" className="mt-4">
            <Button variant="outline" className="w-full justify-between group">
              Review Educators
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
