import Link from "next/link";
import { VoeWordmark } from "@/components/brand/vault-mark";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getEnrolledClasses } from "@/lib/queries/classes";
import { getClassesForEducator } from "@/lib/queries/educator";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { getPendingEducatorCount } from "@/lib/queries/educator-approvals";
import { getPendingReportCount } from "@/lib/queries/class-reports";
import { getUnreadAnnouncementCountsByClass } from "@/lib/queries/announcements";
import { isClassBrowseEnabled } from "@/lib/config/features";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";

export async function Sidebar() {
  const profile = await getCurrentProfile();

  const role = profile?.role ?? "student";
  const isApproved = profile?.is_approved ?? true;
  const isPendingEducator = role === "educator" && !isApproved;

  let classes: Array<{ id: string; code: string; title: string }> = [];
  let pendingApplicationCount = 0;
  let pendingReportCount = 0;
  /* Admins are effectively premium; approved educators read their tier. Drives which nav items the
     basic tier sees locked (classes / videos / question bank are premium). */
  let isPremium = role === "admin";

  if (profile && !isPendingEducator) {
    if (role === "educator" || role === "admin") {
      const educatorClasses = await getClassesForEducator(profile.id);
      classes = educatorClasses.map((c) => ({ id: c.id, code: c.code, title: c.title }));
      if (role === "educator") {
        const ep = await getEducatorProfile(profile.id);
        isPremium = (ep?.tier ?? "basic") === "premium";
      }
    } else {
      const enrolled = await getEnrolledClasses(profile.id);
      classes = enrolled.map((c) => ({ id: c.id, code: c.code, title: c.title }));
    }
  }

  /* Per-class unread-announcement badges — a student affordance (educators authored their own, so the
     count would be noise). */
  let classUnread: Record<string, number> = {};
  if (role === "student" && profile && classes.length > 0) {
    const counts = await getUnreadAnnouncementCountsByClass(profile.id, classes.map((c) => c.id));
    classUnread = Object.fromEntries(counts);
  }

  if (role === "admin") {
    [pendingApplicationCount, pendingReportCount] = await Promise.all([
      getPendingEducatorCount(),
      getPendingReportCount(),
    ]);
  }

  /* /dashboard is everyone's home (student or educator hub); admins land there too — /admin is a
     separate console, not the home. Pending educators are pinned to their gate page. */
  const homeHref = isPendingEducator ? "/pending" : "/dashboard";

  return (
    <aside className="w-64 bg-card border-r border-border h-screen sticky top-0 flex flex-col md:flex shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
        <Link href={homeHref} className="hover:opacity-80 transition-opacity">
          <VoeWordmark />
        </Link>
      </div>

      <SidebarNav
        role={role}
        classes={classes}
        classUnread={classUnread}
        pendingApplicationCount={pendingApplicationCount}
        pendingReportCount={pendingReportCount}
        isPendingEducator={isPendingEducator}
        isPremium={isPremium}
        browseEnabled={isClassBrowseEnabled()}
      />

      <div className="p-4 border-t border-border flex items-center gap-2 shrink-0">
        <div className="flex-1">
          <LogoutButton />
        </div>
        <div className="shrink-0">
          <ThemeSwitcher />
        </div>
      </div>
    </aside>
  );
}
