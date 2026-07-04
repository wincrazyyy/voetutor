"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type LucideIcon,
  LayoutDashboard,
  Settings,
  BookMarked,
  BookOpen,
  Library,
  ClipboardList,
  Flag,
  ShieldCheck,
  Star,
  Store,
  UserCheck,
  UserCircle,
  Users,
  Hourglass,
  Lock,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";

interface SidebarNavProps {
  role: UserRole;
  classes: Array<{ id: string; code: string; title: string }>;
  /** Per-class unread-announcement counts (students). */
  classUnread?: Record<string, number>;
  pendingApplicationCount?: number;
  pendingReportCount?: number;
  isPendingEducator?: boolean;
  /** Admin or premium-tier educator. Premium-only nav (Content Library, Question Bank, the classes
   *  section) is **hidden entirely** for basic-tier educators — premium is admin-granted, never advertised. */
  isPremium?: boolean;
  /** CLASS_BROWSE_ENABLED flag — when false the student "Browse Classes" item is removed entirely
   *  (not shown locked). The admin "Classes" management item is unaffected. */
  browseEnabled?: boolean;
}

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  lockable: boolean;
  /** Premium-only item — omitted from the nav entirely for non-premium educators (not shown locked). */
  premium?: boolean;
  badge?: number;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const PENDING_HINT = "Locked while your educator account is awaiting admin approval.";

export function SidebarNav({
  role,
  classes,
  classUnread = {},
  pendingApplicationCount = 0,
  pendingReportCount = 0,
  isPendingEducator = false,
  isPremium = true,
  browseEnabled = true,
}: SidebarNavProps) {
  const pathname = usePathname();

  const studentLinks: NavItem[] = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, lockable: true },
    { name: "Browse Classes", href: "/classes", icon: Store, lockable: true },
    { name: "Question Bank", href: "/question-bank", icon: Library, lockable: true },
    { name: "Settings", href: "/settings", icon: Settings, lockable: false },
  ];

  const educatorLinks: NavItem[] = [
    { name: "Educator Hub", href: "/dashboard", icon: LayoutDashboard, lockable: true },
    { name: "My Profile", href: "/profile", icon: UserCircle, lockable: true },
    { name: "Reviews", href: "/reviews", icon: Star, lockable: true },
    { name: "Content Library", href: "/library", icon: Video, lockable: true, premium: true },
    { name: "Question Bank", href: "/question-bank", icon: Library, lockable: true, premium: true },
    { name: "Settings", href: "/settings", icon: Settings, lockable: false },
  ];

  /* Pending educators become BASIC on approval, so their locked preview shows only the basic feature
     set (profile + reviews) — never the premium items, which they won't get without an admin grant. */
  const pendingEducatorLinks: NavItem[] = [
    { name: "Pending Status", href: "/pending", icon: Hourglass, lockable: false },
    { name: "Educator Hub", href: "/dashboard", icon: LayoutDashboard, lockable: true },
    { name: "My Profile", href: "/profile", icon: UserCircle, lockable: true },
    { name: "Reviews", href: "/reviews", icon: Star, lockable: true },
    { name: "Settings", href: "/settings", icon: Settings, lockable: false },
  ];

  /* Admins see a labelled split: platform-moderation tools under "Admin", the
     educator-facing panels they also have under "Educator", so it's obvious
     which hat each item belongs to. */
  const adminAdminLinks: NavItem[] = [
    { name: "Admin Hub", href: "/admin", icon: ShieldCheck, lockable: false },
    {
      name: "Approvals",
      href: "/approvals",
      icon: UserCheck,
      lockable: false,
      badge: pendingApplicationCount,
    },
    { name: "Educators", href: "/admin/educators", icon: Users, lockable: false },
    {
      name: "Reports",
      href: "/reports",
      icon: Flag,
      lockable: false,
      badge: pendingReportCount,
    },
    { name: "Classes", href: "/classes", icon: BookOpen, lockable: false },
  ];

  const adminEducatorLinks: NavItem[] = [
    { name: "Educator Hub", href: "/dashboard", icon: LayoutDashboard, lockable: false },
    { name: "My Profile", href: "/profile", icon: UserCircle, lockable: false },
    { name: "Reviews", href: "/reviews", icon: Star, lockable: false },
    { name: "Content Library", href: "/library", icon: Video, lockable: false },
    { name: "Question Bank", href: "/question-bank", icon: Library, lockable: false },
    { name: "Settings", href: "/settings", icon: Settings, lockable: false },
  ];

  let sections: NavSection[];
  if (role === "admin") {
    sections = [
      { label: "Admin", items: adminAdminLinks },
      { label: "Educator", items: adminEducatorLinks },
    ];
  } else if (role === "educator") {
    sections = isPendingEducator
      ? [{ label: "Pending Approval", items: pendingEducatorLinks }]
      : [{ label: "Educator", items: educatorLinks.filter((l) => isPremium || !l.premium) }];
  } else {
    sections = [
      { label: "Menu", items: studentLinks.filter((l) => browseEnabled || l.href !== "/classes") },
    ];
  }

  const classSectionLabel = role === "educator" || role === "admin" ? "Your Classes" : "Enrolled Classes";
  /* One role-resolved class URL: /class/[id] renders the learning view for students and the management
     view for the owning educator / admin. */
  const classHrefPrefix = "/class";
  /* Classes are a premium teaching feature. Show the section only to students (enrolments), admins, and
     premium educators — basic + pending educators don't see it at all (premium stays invisible). */
  const showClasses =
    role === "student" || role === "admin" || (role === "educator" && isPremium && !isPendingEducator);

  return (
    <nav className="flex-1 flex flex-col gap-6 px-4 py-6 overflow-y-auto">
      {isPendingEducator && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-primary">
          <Hourglass className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="leading-relaxed">
            Educator account awaiting admin approval. We&apos;ll unlock everything once you&apos;re approved.
          </span>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-2">
            {section.label}
          </div>
          {section.items.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            const badge = link.badge;
            const locked = isPendingEducator && link.lockable;

            if (locked) {
              return (
                <span
                  key={link.name}
                  title={PENDING_HINT}
                  aria-disabled
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                    "text-muted-foreground/60 cursor-not-allowed select-none",
                  )}
                >
                  <Icon className="w-5 h-5 opacity-60" />
                  <span className="flex-1">{link.name}</span>
                  <Lock className="w-3.5 h-3.5 opacity-60" />
                </span>
              );
            }

            return (
              <Link
                key={link.name}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1">{link.name}</span>
                {typeof badge === "number" && badge > 0 && (
                  <Badge variant="secondary" className="bg-primary/15 text-primary text-[10px] px-1.5 h-5">
                    {badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      {showClasses && (
        <div className="flex flex-col gap-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 mt-2">
            {classSectionLabel}
          </div>

          <div className="relative flex flex-col gap-1 mt-1">
            {classes.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2 italic">
                {role === "educator" || role === "admin" ? "No classes assigned yet." : "No enrolments yet."}
              </p>
            ) : (
              classes.map((cls) => {
                const href = `${classHrefPrefix}/${cls.id}`;
                const isActive = pathname.startsWith(href);
                return (
                  <Link
                    key={cls.id}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 flex items-center justify-center rounded-md border shrink-0",
                        isActive
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-muted-foreground/30 text-muted-foreground group-hover:border-foreground",
                      )}
                    >
                      {role === "educator" || role === "admin" ? (
                        <ClipboardList className="w-3 h-3" />
                      ) : (
                        <BookMarked className="w-3 h-3" />
                      )}
                    </div>
                    <span className="flex-1 truncate">{cls.title}</span>
                    {(classUnread[cls.id] ?? 0) > 0 && (
                      <Badge variant="secondary" className="bg-primary/15 text-primary text-[10px] px-1.5 h-5 shrink-0">
                        {classUnread[cls.id]}
                      </Badge>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
