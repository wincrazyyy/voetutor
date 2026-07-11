"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type LucideIcon,
  LayoutDashboard,
  Settings,
  BookOpen,
  GraduationCap,
  GripVertical,
  Library,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { LinkPending } from "@/components/layout/link-pending";
import { reorderSidebarClassesAction } from "@/app/actions/class-order";

type ClassItem = {
  id: string;
  code: string;
  title: string;
  educatorAvatarUrl: string | null;
  educatorFirstName: string | null;
  educatorLastName: string | null;
  educatorDisplayName: string | null;
};

interface SidebarNavProps {
  role: UserRole;
  classes: ClassItem[];
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
    { name: "Students", href: "/admin/students", icon: GraduationCap, lockable: false },
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
                <LinkPending className="size-4 shrink-0 opacity-70" />
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
              <TooltipProvider delayDuration={300}>
                <SortableClassList classes={classes} classUnread={classUnread} classHrefPrefix={classHrefPrefix} />
              </TooltipProvider>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

/**
 * The class-name span, byte-identical to the plain `flex-1 truncate` span at rest. It measures its
 * own overflow (ResizeObserver + re-measure on title change) and, ONLY when the title is actually
 * truncated, wraps itself in a hover tooltip carrying the full title. Rendering the Tooltip
 * conditionally (always uncontrolled) sidesteps any controlled/uncontrolled `open` warning.
 */
function TruncatedClassTitle({ title, suppressTooltip }: { title: string; suppressTooltip?: boolean }) {
  const elRef = useRef<HTMLSpanElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  /* Callback ref instead of a ref+effect pair: when the tooltip wrapper mounts/unmounts, the span
     remounts at a new tree position, and an effect keyed on `title` alone would keep observing the
     detached old node. The callback re-attaches the observer to whichever node is current. */
  const attachRef = useCallback((el: HTMLSpanElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    elRef.current = el;
    if (!el) return;
    const measure = () => setIsTruncated(el.scrollWidth > el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  /* A title change alone doesn't resize the span, so the ResizeObserver won't fire — re-measure. */
  useEffect(() => {
    const el = elRef.current;
    if (el) setIsTruncated(el.scrollWidth > el.clientWidth);
  }, [title]);

  const span = (
    <span ref={attachRef} className="flex-1 truncate">
      {title}
    </span>
  );

  if (!isTruncated || suppressTooltip) return span;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{span}</TooltipTrigger>
      <TooltipContent side="right">{title}</TooltipContent>
    </Tooltip>
  );
}

function SortableClassList({
  classes,
  classUnread,
  classHrefPrefix,
}: {
  classes: ClassItem[];
  classUnread: Record<string, number>;
  classHrefPrefix: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ClassItem[]>(classes);
  const [, startTransition] = useTransition();

  /* Re-sync when the server hands down a new ordering / membership (e.g. after a reorder revalidate,
     an enrolment, or a class delete). */
  useEffect(() => {
    setItems(classes);
  }, [classes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((c) => c.id === active.id);
    const newIndex = items.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);

    startTransition(async () => {
      const result = await reorderSidebarClassesAction(next.map((c) => c.id));
      if (result.error) {
        setItems(previous);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <DndContext
      id="sidebar-classes"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {items.map((cls) => (
          <SortableClassRow
            key={cls.id}
            cls={cls}
            unread={classUnread[cls.id] ?? 0}
            classHrefPrefix={classHrefPrefix}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableClassRow({
  cls,
  unread,
  classHrefPrefix,
}: {
  cls: ClassItem;
  unread: number;
  classHrefPrefix: string;
}) {
  const pathname = usePathname();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cls.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const href = `${classHrefPrefix}/${cls.id}`;
  const isActive = pathname.startsWith(href);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center rounded-lg group",
        isActive ? "bg-primary/10" : "hover:bg-muted",
        isDragging ? "opacity-40" : "",
      )}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${cls.title}`}
        className="pl-2 py-2.5 text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 pr-3 pl-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex-1 min-w-0",
          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        <UserAvatar
          avatarUrl={cls.educatorAvatarUrl}
          firstName={cls.educatorFirstName}
          lastName={cls.educatorLastName}
          displayName={cls.educatorDisplayName}
          size={20}
        />
        <TruncatedClassTitle title={cls.title} suppressTooltip={isDragging} />
        {unread > 0 && (
          <Badge variant="secondary" className="bg-primary/15 text-primary text-[10px] px-1.5 h-5 shrink-0">
            {unread}
          </Badge>
        )}
        <LinkPending className="size-3.5 shrink-0 opacity-70" />
      </Link>
    </div>
  );
}
