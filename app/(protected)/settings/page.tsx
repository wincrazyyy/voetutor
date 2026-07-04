import { redirect } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { getDisplayName } from "@/lib/utils/format";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const displayName = getDisplayName(profile.first_name, profile.last_name, profile.display_name);
  const educatorProfile =
    profile.role === "educator" || profile.role === "admin" ? await getEducatorProfile(profile.id) : null;
  /* The account avatar (profiles.avatar_url) is what Settings manages; fall back to the educator
     masthead photo for display so the chip here matches what shows in the navbar. */
  const effectiveAvatarUrl = profile.avatar_url ?? educatorProfile?.avatar_url ?? null;

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <SettingsIcon className="w-7 h-7 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground">Manage your account preferences and profile.</p>
      </div>

      <Card className="p-6 border border-border shadow-sm bg-card">
        <div className="flex items-center gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold">{displayName}</h2>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-bold mt-1">
              {profile.role}
            </Badge>
          </div>
        </div>

        <div className="mb-6 border-b border-border pb-6">
          <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-3">Avatar</div>
          <AvatarUploader
            userId={profile.id}
            avatarUrl={effectiveAvatarUrl}
            hasCustomAvatar={!!profile.avatar_url}
            firstName={profile.first_name}
            lastName={profile.last_name}
            displayName={profile.display_name}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">First name</div>
            <div className="font-medium">{profile.first_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Last name</div>
            <div className="font-medium">{profile.last_name ?? "—"}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Display name</div>
            <div className="font-medium">{profile.display_name ?? "—"}</div>
          </div>
        </div>
      </Card>

      <Card className="p-12 border border-dashed border-border bg-card/50 text-center">
        <h2 className="text-lg font-bold mb-1">Profile editing coming soon</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Inline editing of your name and display name will be available shortly.
        </p>
      </Card>
    </div>
  );
}
