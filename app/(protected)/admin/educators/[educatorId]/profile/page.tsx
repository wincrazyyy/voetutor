import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentProfile, getProfileById } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { Button } from "@/components/ui/button";
import { ProfileBuilder } from "@/components/educator/profile-builder/profile-builder";
import { EMPTY_EDUCATOR_PROFILE_DOC } from "@/lib/types/profile-doc";

export default async function AdminEditEducatorProfilePage({
  params,
}: {
  params: Promise<{ educatorId: string }>;
}) {
  const { educatorId } = await params;

  const me = await getCurrentProfile();
  if (!me) redirect("/auth/login");
  if (me.role !== "admin") redirect("/dashboard");

  const target = await getProfileById(educatorId);
  if (!target || (target.role !== "educator" && target.role !== "admin")) notFound();

  const ep = await getEducatorProfile(educatorId);
  const initialDoc =
    ep?.profile_doc && Array.isArray(ep.profile_doc.sections) ? ep.profile_doc : EMPTY_EDUCATOR_PROFILE_DOC;

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
        <Link href="/admin/educators?status=profiles">
          <Button variant="ghost" size="sm" className="-ml-2 gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to educators
          </Button>
        </Link>
      </div>
      <ProfileBuilder
        adminEdit
        educatorId={educatorId}
        firstName={target.first_name}
        lastName={target.last_name}
        displayName={target.display_name}
        isVerified={ep?.is_verified ?? false}
        tier={ep?.tier ?? "basic"}
        initialAvatarUrl={ep?.avatar_url ?? null}
        initialRoleLabel={ep?.role_label ?? ""}
        initialHeadline={ep?.headline ?? ""}
        initialHourlyRateCents={ep?.hourly_rate_cents ?? null}
        initialSubjectTags={ep?.subject_tags ?? []}
        initialDoc={initialDoc}
        initialPublished={ep?.is_published ?? false}
      />
    </div>
  );
}
