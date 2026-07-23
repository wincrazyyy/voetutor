import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserCog } from "lucide-react";

import { getCurrentProfile, getProfileById } from "@/lib/queries/profile";
import { getEducatorAdminHud } from "@/lib/queries/educator-insights";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EducatorHudHeader } from "@/components/admin/educator-hud-header";
import { EducatorAdminControls } from "@/components/admin/educator-admin-controls";
import { EducatorPersonalInfo } from "@/components/admin/educator-personal-info";
import { EducatorHudStats } from "@/components/admin/educator-hud-stats";
import { EducatorClassBreakdown } from "@/components/admin/educator-class-breakdown";
import { EducatorHudTabs } from "@/components/admin/educator-hud-tabs";
import { DeleteAccountButton } from "@/components/admin/delete-account-button";
import { deleteEducatorAccountAction } from "@/app/actions/educators";
import { getDisplayName } from "@/lib/utils/format";

type ProfileState = "live" | "draft" | "none";

export default async function AdminEducatorHudPage({
  params,
}: {
  params: Promise<{ educatorId: string }>;
}) {
  const { educatorId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "admin") redirect("/dashboard");

  const target = await getProfileById(educatorId);
  if (!target || (target.role !== "educator" && target.role !== "admin")) notFound();

  const hud = await getEducatorAdminHud(educatorId);

  const ep = hud.educatorProfile;
  const state: ProfileState = !ep
    ? "none"
    : ep.is_published
      ? "live"
      : (ep.profile_doc?.sections?.length ?? 0) > 0 ||
          Boolean(ep.headline) ||
          Boolean(ep.role_label) ||
          Boolean(ep.avatar_url) ||
          (ep.subject_tags?.length ?? 0) > 0
        ? "draft"
        : "none";

  const name = getDisplayName(target.first_name, target.last_name, target.display_name);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
      <div>
        <Link href="/admin/educators">
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Educators
          </Button>
        </Link>

        <h1 className="mb-2 flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
          <UserCog className="w-6 h-6 shrink-0 text-primary sm:w-7 sm:h-7" />
          <span className="min-w-0 break-words">Manage Educator</span>
        </h1>
        <p className="text-muted-foreground">
          Everything the platform knows about {name} — profile, classes, content, and controls.
        </p>
      </div>

      <EducatorHudHeader
        target={target}
        educatorProfile={ep}
        profileState={state}
        reviews={hud.reviews}
        verifiedByName={hud.verifiedByName}
      />

      <EducatorAdminControls
        educatorId={educatorId}
        tier={ep?.tier ?? "basic"}
        isVerified={ep?.is_verified ?? false}
        isPublished={ep?.is_published ?? false}
        canPublish={state !== "none"}
      />

      <EducatorHudTabs
        statistics={
          <EducatorHudStats
            teaching={hud.teaching}
            library={hud.library}
            reviews={hud.reviews}
            educatorId={educatorId}
          />
        }
        classes={<EducatorClassBreakdown classes={hud.classes} />}
        personal={
          <EducatorPersonalInfo
            educatorProfile={ep}
            accountCreatedAt={target.created_at}
            approvedAt={target.approved_at}
          />
        }
      />

      <Card className="border-destructive/30 bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-1 text-lg font-bold text-destructive">Danger zone</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Deleting this account is permanent and removes everything tied to it.
        </p>
        {target.role !== "admin" ? (
          <DeleteAccountButton
            accountId={target.id}
            accountName={name}
            action={deleteEducatorAccountAction}
            description={
              <>
                removes their login, public profile and reviews, every class they own — with all
                topics, lessons, notes, announcements, forum threads, and every student&apos;s
                enrolment and progress in those classes — plus their entire content library and all
                uploaded videos and files. This cannot be undone.
              </>
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">Admin accounts can&apos;t be deleted.</p>
        )}
      </Card>
    </div>
  );
}
