import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getEnrolledClasses } from "@/lib/queries/classes";
import { getClassesForEducator } from "@/lib/queries/educator";
import { getPendingEducatorCount } from "@/lib/queries/educator-approvals";
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

  if (profile && !isPendingEducator) {
    if (role === "educator" || role === "admin") {
      const educatorClasses = await getClassesForEducator(profile.id);
      classes = educatorClasses.map((c) => ({ id: c.id, code: c.code, title: c.title }));
    } else {
      const enrolled = await getEnrolledClasses(profile.id);
      classes = enrolled.map((c) => ({ id: c.id, code: c.code, title: c.title }));
    }
  }

  if (role === "admin") {
    pendingApplicationCount = await getPendingEducatorCount();
  }

  let homeHref = "/dashboard";
  if (role === "admin") homeHref = "/admin";
  else if (role === "educator" && isApproved) homeHref = "/educator";
  else if (isPendingEducator) homeHref = "/pending";

  return (
    <aside className="w-64 bg-card border-r border-border h-screen sticky top-0 flex flex-col md:flex shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
        <Link
          href={homeHref}
          className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity"
        >
          <GraduationCap className="w-6 h-6" />
          <span className="font-bold text-lg tracking-tight">WSPortal</span>
        </Link>
      </div>

      <SidebarNav
        role={role}
        classes={classes}
        pendingApplicationCount={pendingApplicationCount}
        isPendingEducator={isPendingEducator}
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
