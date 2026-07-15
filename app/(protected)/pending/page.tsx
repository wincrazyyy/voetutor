import { redirect } from "next/navigation";
import { Hourglass } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDisplayName, relativeTime } from "@/lib/utils/format";
import { EducatorProfileForm } from "@/components/educator/educator-profile-form";

export default async function PendingApprovalPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  if (profile.role !== "educator" || profile.is_approved) {
    redirect("/dashboard");
  }

  const name = getDisplayName(profile.first_name, profile.last_name, profile.display_name);
  const educatorProfile = await getEducatorProfile(profile.id);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
      <Card className="p-6 sm:p-8 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Hourglass className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Awaiting admin approval</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary mt-1 capitalize">
              Educator (pending)
            </Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Hi {name} — your educator account was created {relativeTime(profile.created_at)}. An administrator needs to approve it before you can publish content, manage classes, or post announcements.
        </p>
        <p className="text-sm text-muted-foreground">
          You don&apos;t need to do anything else — but filling in the details below helps administrators approve you faster, and we may use the information to promote you to prospective students once approved.
        </p>
      </Card>

      <EducatorProfileForm educatorId={profile.id} initial={educatorProfile} />
    </div>
  );
}
