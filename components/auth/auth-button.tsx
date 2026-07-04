import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import type { Profile } from "@/lib/types/database";
import { UserMenu } from "@/components/auth/user-menu";

function roleLabelFor(profile: Profile): string {
  if (profile.role === "admin") return "Admin";
  if (profile.role === "educator") return profile.is_approved ? "Educator" : "Educator · Pending approval";
  return "Student";
}

export async function AuthButton() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/auth/login">Sign in</Link>
        </Button>
        <Button asChild size="sm" variant="default">
          <Link href="/auth/sign-up">Sign up</Link>
        </Button>
      </div>
    );
  }

  /* Account avatar (profiles.avatar_url, any user) wins; fall back to the educator masthead photo for
     educators/admins who have only set that. Students without an account avatar fall back to initials. */
  const educatorProfile =
    profile.role === "educator" || profile.role === "admin" ? await getEducatorProfile(profile.id) : null;

  return (
    <UserMenu
      firstName={profile.first_name}
      lastName={profile.last_name}
      displayName={profile.display_name}
      avatarUrl={profile.avatar_url ?? educatorProfile?.avatar_url ?? null}
      roleLabel={roleLabelFor(profile)}
    />
  );
}
