import Link from "next/link";
import { ArrowLeft, UserCheck } from "lucide-react";

import { getApprovedEducators, getPendingEducators } from "@/lib/queries/educator-approvals";
import { getEducatorProfilesByIds } from "@/lib/queries/educator-profiles";
import { Button } from "@/components/ui/button";
import { EducatorsList } from "@/components/admin/educators-list";

export default async function AdminEducatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status === "approved" ? "approved" : "pending";

  const educators = filter === "pending" ? await getPendingEducators() : await getApprovedEducators();
  const educatorProfiles = await getEducatorProfilesByIds(educators.map((e) => e.id));

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      <div>
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Admin Hub
          </Button>
        </Link>

        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <UserCheck className="w-7 h-7 text-primary" />
          Educator Approvals
        </h1>
        <p className="text-muted-foreground">
          Approve educators to grant them platform access. Approval is atomic and unlocks the educator hub on their next page load.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-2">
        {(["pending", "approved"] as const).map((s) => {
          const active = filter === s;
          return (
            <Link key={s} href={`/admin/educators?status=${s}`}>
              <Button variant={active ? "default" : "ghost"} size="sm" className="capitalize">
                {s}
              </Button>
            </Link>
          );
        })}
      </div>

      <EducatorsList educators={educators} educatorProfiles={educatorProfiles} filter={filter} />
    </div>
  );
}
