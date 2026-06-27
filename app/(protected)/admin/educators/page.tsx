import Link from "next/link";
import { ArrowLeft, UserCheck } from "lucide-react";

import {
  getAllPlatformEducators,
  getApprovedEducators,
  getPendingEducators,
} from "@/lib/queries/educator-approvals";
import { getEducatorProfilesByIds } from "@/lib/queries/educator-profiles";
import { Button } from "@/components/ui/button";
import { EducatorsList } from "@/components/admin/educators-list";
import { EducatorProfilesList } from "@/components/admin/educator-profiles-list";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "profiles", label: "All profiles" },
] as const;

type Filter = (typeof TABS)[number]["key"];

export default async function AdminEducatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter: Filter =
    status === "approved" ? "approved" : status === "profiles" ? "profiles" : "pending";

  const educators =
    filter === "pending"
      ? await getPendingEducators()
      : filter === "approved"
        ? await getApprovedEducators()
        : await getAllPlatformEducators();
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
          Approve educators to grant them platform access, or open <span className="font-medium text-foreground">All profiles</span> to view and edit any educator&apos;s public profile.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-2">
        {TABS.map((t) => {
          const active = filter === t.key;
          return (
            <Link key={t.key} href={`/admin/educators?status=${t.key}`}>
              <Button variant={active ? "default" : "ghost"} size="sm">
                {t.label}
              </Button>
            </Link>
          );
        })}
      </div>

      {filter === "profiles" ? (
        <EducatorProfilesList educators={educators} educatorProfiles={educatorProfiles} />
      ) : (
        <EducatorsList educators={educators} educatorProfiles={educatorProfiles} filter={filter} />
      )}
    </div>
  );
}
