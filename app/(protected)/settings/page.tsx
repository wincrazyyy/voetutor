import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings as SettingsIcon, UserCircle } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { getStudentProfile } from "@/lib/queries/student-profiles";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AccountNameForm } from "@/components/settings/account-name-form";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { StudentProfileForm } from "@/components/settings/student-profile-form";
import { EducatorProfileForm } from "@/components/educator/educator-profile-form";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const isStudent = profile.role === "student";
  const educatorProfile =
    profile.role === "educator" || profile.role === "admin" ? await getEducatorProfile(profile.id) : null;
  const studentProfile = isStudent ? await getStudentProfile(profile.id) : null;
  /* The account avatar (profiles.avatar_url) is what Settings manages; fall back to the educator
     masthead photo for display so the chip here matches what shows in the navbar. */
  const effectiveAvatarUrl = profile.avatar_url ?? educatorProfile?.avatar_url ?? null;

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <SettingsIcon className="w-7 h-7 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground">Manage your account preferences and profile.</p>
      </div>

      <Card className="p-6 border border-border shadow-sm bg-card space-y-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Account</h2>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-bold">
            {profile.role}
          </Badge>
        </div>

        <div>
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

        <div className="border-t border-border/60 pt-6">
          <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">
            Your name
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {isStudent
              ? "Shown across the platform — your classes and the forum."
              : "Shown across the platform — your public profile, classes, and the forum."}
          </p>
          <AccountNameForm firstName={profile.first_name ?? ""} lastName={profile.last_name ?? ""} />
        </div>

        <div className="border-t border-border/60 pt-6">
          {isStudent ? (
            <>
              <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">
                Your details
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Keep your enrolment details up to date. Your email is set at sign-up and can&apos;t be changed
                here.
              </p>
              <StudentProfileForm
                showName={false}
                firstName={profile.first_name ?? ""}
                lastName={profile.last_name ?? ""}
                whatsappNumber={studentProfile?.whatsapp_number ?? ""}
                school={studentProfile?.school ?? ""}
                schoolYear={studentProfile?.school_year ?? ""}
                targetGrade={studentProfile?.target_grade ?? ""}
              />
            </>
          ) : (
            <EducatorProfileForm educatorId={profile.id} initial={educatorProfile} context="settings" />
          )}
        </div>
      </Card>

      {!isStudent && (
        <Card className="p-6 border border-border shadow-sm bg-card">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UserCircle className="w-5 h-5 text-primary" />
            Public profile
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your public profile page is what prospective students see. It&apos;s edited separately from the
            private details above.
          </p>
          <Link
            href="/profile"
            className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary after:absolute after:-inset-3 after:content-[''] hover:underline"
          >
            Edit public profile →
          </Link>
        </Card>
      )}
    </div>
  );
}
