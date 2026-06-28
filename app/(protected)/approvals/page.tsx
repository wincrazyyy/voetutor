import { redirect } from "next/navigation";
import Link from "next/link";
import { UserCheck } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getApprovedEducators, getPendingEducators } from "@/lib/queries/educator-approvals";
import { getEducatorProfilesByIds } from "@/lib/queries/educator-profiles";
import { Button } from "@/components/ui/button";
import { EducatorsList } from "@/components/admin/educators-list";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
] as const;

type Filter = (typeof TABS)[number]["key"];

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const { status } = await searchParams;
  const filter: Filter = status === "approved" ? "approved" : "pending";

  const educators = filter === "pending" ? await getPendingEducators() : await getApprovedEducators();
  const educatorProfiles = await getEducatorProfilesByIds(educators.map((e) => e.id));

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <UserCheck className="w-7 h-7 text-primary" />
          Educator Approvals
        </h1>
        <p className="text-muted-foreground">
          Approve educators to grant them platform access. To view or edit any educator&apos;s public
          profile, use{" "}
          <Link href="/educators" className="font-medium text-foreground underline underline-offset-2">
            Educators
          </Link>
          .
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-2">
        {TABS.map((t) => {
          const active = filter === t.key;
          return (
            <Link key={t.key} href={`/approvals?status=${t.key}`}>
              <Button variant={active ? "default" : "ghost"} size="sm">
                {t.label}
              </Button>
            </Link>
          );
        })}
      </div>

      <EducatorsList educators={educators} educatorProfiles={educatorProfiles} filter={filter} />
    </div>
  );
}
