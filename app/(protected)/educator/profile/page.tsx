import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { ProfileBuilder } from "@/components/educator/profile-builder/profile-builder";
import { EMPTY_EDUCATOR_PROFILE_DOC } from "@/lib/types/profile-doc";

export default async function EducatorProfileBuilderPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "educator" && profile.role !== "admin") redirect("/dashboard");
  if (profile.role === "educator" && !profile.is_approved) redirect("/pending");

  const ep = await getEducatorProfile(profile.id);
  const initialDoc =
    ep?.profile_doc && Array.isArray(ep.profile_doc.sections) ? ep.profile_doc : EMPTY_EDUCATOR_PROFILE_DOC;

  return (
    <ProfileBuilder
      educatorId={profile.id}
      firstName={profile.first_name}
      lastName={profile.last_name}
      displayName={profile.display_name}
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
  );
}
