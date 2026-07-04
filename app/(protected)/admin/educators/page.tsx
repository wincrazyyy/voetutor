import Link from "next/link";
import { redirect } from "next/navigation";
import { UserCheck, Users } from "lucide-react";

import { EducatorProfilesList } from "@/components/admin/educator-profiles-list";
import { getCurrentProfile } from "@/lib/queries/profile";
import { getAllPlatformEducators } from "@/lib/queries/educator-approvals";
import { getEducatorProfilesByIds } from "@/lib/queries/educator-profiles";

export default async function AdminEducatorsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const educators = await getAllPlatformEducators();
  const educatorProfiles = await getEducatorProfilesByIds(educators.map((e) => e.id));

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Users className="w-7 h-7 text-primary" />
          Educator Profiles
        </h1>
        <p className="text-muted-foreground">
          View and edit any educator&apos;s public profile and reviews. To approve pending educators, use{" "}
          <Link
            href="/approvals"
            className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2"
          >
            <UserCheck className="w-3.5 h-3.5" />
            Approvals
          </Link>
          .
        </p>
      </div>
      <EducatorProfilesList
        educators={educators}
        educatorProfiles={educatorProfiles}
        currentUserId={profile.id}
      />
    </div>
  );
}
