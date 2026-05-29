"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  BookMarked,
  BookOpen,
  Library,
  ClipboardList,
  Flag,
  ShieldCheck,
  Store,
  UserCheck,
  Hourglass,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";

interface SidebarNavProps {
  role: UserRole;
  classes: Array<{ id: string; code: string; title: string }>;
  pendingApplicationCount?: number;
  pendingReportCount?: number;
  isPendingEducator?: boolean;
}

const PENDING_HINT = "Locked while your educator account is awaiting admin approval.";

export function SidebarNav({
  role,
  classes,
  pendingApplicationCount = 0,
  pendingReportCount = 0,
  isPendingEducator = false,
}: SidebarNavProps) {
  const pathname = usePathname();

  const studentLinks = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, lockable: true },
    { name: "Browse Classes", href: "/classes/browse", icon: Store, lockable: true },
    { name: "Question Bank", href: "/question-bank", icon: Library, lockable: true },
    { name: "Settings", href: "/settings", icon: Settings, lockable: false },
  ];

  const educatorLinks = [
    { name: "Educator Hub", href: "/educator", icon: LayoutDashboard, lockable: true },
    { name: "Question Bank", href: "/question-bank", icon: Library, lockable: true },
    { name: "Settings", href: "/settings", icon: Settings, lockable: false },
  ];

  const pendingEducatorLinks = [
    { name: "Pending Status", href: "/pending", icon: Hourglass, lockable: false },
    { name: "Educator Hub", href: "/educator", icon: LayoutDashboard, lockable: true },
    { name: "Question Bank", href: "/question-bank", icon: Library, lockable: true },
    { name: "Settings", href: "/settings", icon: Settings, lockable: false },
  ];

  const adminLinks = [
    { name: "Admin Hub", href: "/admin", icon: ShieldCheck, lockable: false },
    {
      name: "Educators",
      href: "/admin/educators",
      icon: UserCheck,
      lockable: false,
      badge: pendingApplicationCount,
    },
    {
      name: "Reports",
      href: "/admin/reports",
      icon: Flag,
      lockable: false,
      badge: pendingReportCount,
    },
    { name: "Classes", href: "/admin/classes", icon: BookOpen, lockable: false },
    { name: "Educator Hub", href: "/educator", icon: LayoutDashboard, lockable: false },
    { name: "Question Bank", href: "/question-bank", icon: Library, lockable: false },
    { name: "Settings", href: "/settings", icon: Settings, lockable: false },
  ];

  let links;
  let menuLabel;
  if (role === "admin") {
    links = adminLinks;
    menuLabel = "Admin";
  } else if (role === "educator") {
    links = isPendingEducator ? pendingEducatorLinks : educatorLinks;
    menuLabel = isPendingEducator ? "Pending Approval" : "Educator";
  } else {
    links = studentLinks;
    menuLabel = "Menu";
  }

  const classSectionLabel = role === "educator" || role === "admin" ? "Your Classes" : "Enrolled Classes";
  const classHrefPrefix = role === "educator" || role === "admin" ? "/educator/classes" : "/classes";

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

      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-2">{menuLabel}</div>
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          const badge = "badge" in link ? link.badge : undefined;
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

      <div className="flex flex-col gap-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 mt-2">
          {classSectionLabel}
        </div>

        <div className="relative flex flex-col gap-1 mt-1">
          {isPendingEducator ? (
            <span
              title={PENDING_HINT}
              aria-disabled
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground/60 cursor-not-allowed select-none"
            >
              <Lock className="w-3.5 h-3.5 opacity-60" />
              <span className="text-xs italic">Locked while pending</span>
            </span>
          ) : classes.length === 0 ? (
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
                  <span className="truncate">{cls.title}</span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </nav>
  );
}
