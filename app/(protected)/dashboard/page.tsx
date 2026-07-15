import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getEnrolledClasses } from "@/lib/queries/classes";
import { getAnnouncementsForUser } from "@/lib/queries/announcements";
import { getContinueWatching, getDashboardStats } from "@/lib/queries/progress";
import { getDisplayName } from "@/lib/utils/format";

import { StatCards } from "@/components/dashboard/stat-cards";
import { ContinueWatchingHero } from "@/components/dashboard/continue-watching-hero";
import { GlobalUpdatesFeed } from "@/components/dashboard/global-updates-feed";
import { MarkAnnouncementsRead } from "@/components/announcements/mark-announcements-read";
import { TableRefresh } from "@/components/realtime/table-refresh";
import { EnrolledClassesList } from "@/components/dashboard/enrolled-classes-list";
import { EducatorHub } from "@/components/dashboard/educator-hub";

export default async function DashboardHubPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  /* Role-resolved home: /dashboard is ALWAYS the educator or student dashboard, never the admin console.
     An admin is an educator with extra privileges, so they get the same EducatorHub here; the separate
     /admin console is reachable from the sidebar. Students get the learning dashboard below. */
  if (profile.role === "admin") return <EducatorHub />;
  if (profile.role === "educator") {
    if (!profile.is_approved) redirect("/pending");
    return <EducatorHub />;
  }

  const [classes, announcements, continueWatching, stats] = await Promise.all([
    getEnrolledClasses(profile.id),
    getAnnouncementsForUser(10),
    getContinueWatching(profile.id, 1),
    getDashboardStats(profile.id),
  ]);

  const firstName = profile.first_name ?? getDisplayName(profile.first_name, profile.last_name, profile.display_name);

  const unreadAnnouncementIds = announcements.filter((a) => !a.has_read).map((a) => a.id);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-8">
      <MarkAnnouncementsRead unreadIds={unreadAnnouncementIds} />
      <TableRefresh channel={`announcements:dashboard:${profile.id}`} subscriptions={[{ table: "announcements" }]} />

      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Welcome back, {firstName}!
        </h1>
        <p className="text-muted-foreground">
          Here is your overall progress and the latest updates from your educators.
        </p>
      </div>

      <StatCards stats={stats} />
      <ContinueWatchingHero item={continueWatching[0] ?? null} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-4">
        <GlobalUpdatesFeed announcements={announcements} viewerId={profile.id} viewerIsAdmin={false} />
        <EnrolledClassesList classes={classes} />
      </div>
    </div>
  );
}
