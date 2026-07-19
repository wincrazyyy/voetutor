"use client";

import { useState, useEffect, useMemo, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronUp,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Save,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Eye,
  Upload,
  Monitor,
  Smartphone,
  X,
  FileText,
  Trophy,
  Tags,
  Link2,
  Tag,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDeleteButton } from "@/components/shared/buttons/confirm-delete-button";
import { cn } from "@/lib/utils";
import { getDisplayName, getInitials } from "@/lib/utils/format";
import {
  EDUCATOR_PROFILE_DOC_VERSION,
  type EducatorProfileDoc,
  type ProfileSection,
  type ProfileSectionType,
} from "@/lib/types/profile-doc";
import {
  saveEducatorProfileAction,
  setProfilePublishedAction,
  adminSaveEducatorProfileAction,
  adminSetProfilePublishedAction,
  type SaveEducatorProfileInput,
} from "@/app/actions/educator-profile";
import { validateProfileDoc, ProfileValidationError } from "@/lib/profile/validate";
import { createSection, SECTION_CATALOG } from "@/lib/profile/builder";
import { PROFILE_LIMITS } from "@/lib/profile/limits";
import { ProfileDoc } from "@/components/profile/render/profile-doc";
import { ProfileHeader } from "@/components/profile/public/profile-header";
import type { PublicEducatorProfile } from "@/lib/types/database";
import type { EducatorTier } from "@/lib/tiers/capabilities";
import { ImageCropModal } from "@/components/media/image-crop-modal";

import { SectionBodyEditor } from "./section-editors";
import { AccentSwatches } from "./accent-swatches";
import { summarizeSection } from "./section-summary";
import { uploadEducatorImage } from "./upload-image";

const TIP_KEY = "voe:profile-builder:tip-dismissed";

const TYPE_LABEL: Record<ProfileSectionType, string> = {
  text: "Text",
  results: "Results",
  lists: "Lists",
  links: "Links",
  services: "Services & Pricing",
  photos: "Photos",
};

const TYPE_ICON: Record<ProfileSectionType, LucideIcon> = {
  text: FileText,
  results: Trophy,
  lists: Tags,
  links: Link2,
  services: Tag,
  photos: ImageIcon,
};

function countItems(s: ProfileSection): number {
  switch (s.type) {
    case "results":
      return s.cards.length;
    case "lists":
      return s.lists.reduce((a, c) => a + c.items.filter((i) => i.trim()).length, 0);
    case "links":
      return s.links.length;
    case "services":
      return s.items.length;
    case "photos":
      return s.images.length;
    default:
      return 0;
  }
}

/** Friendly, positively-framed report of what auto-clean removed, by diffing pre/post validation. */
function cleanupReport(raw: ProfileSection[], cleaned: ProfileSection[]): string {
  const droppedSections = raw.length - cleaned.length;
  const rawItems = raw.reduce((a, s) => a + countItems(s), 0);
  const cleanItems = cleaned.reduce((a, s) => a + countItems(s), 0);
  const droppedItems = Math.max(0, rawItems - cleanItems);
  const parts: string[] = [];
  if (droppedSections > 0) parts.push(`${droppedSections} empty section${droppedSections === 1 ? "" : "s"}`);
  if (droppedItems > 0) parts.push(`${droppedItems} empty row${droppedItems === 1 ? "" : "s"}`);
  if (!parts.length) return "";
  const total = droppedSections + droppedItems;
  return `${parts.join(" and ")} ${total === 1 ? "was" : "were"} tidied up.`;
}

interface ProfileBuilderProps {
  educatorId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  isVerified: boolean;
  tier: EducatorTier;
  initialAvatarUrl: string | null;
  initialRoleLabel: string;
  initialHeadline: string;
  initialHourlyRateCents: number | null;
  initialSubjectTags: string[];
  initialDoc: EducatorProfileDoc;
  initialPublished: boolean;
  /** When true the builder edits the educator identified by `educatorId` on an admin's behalf,
   *  routing saves through the admin action variants instead of the self ones. */
  adminEdit?: boolean;
}

function IconBtn({
  label,
  onClick,
  disabled,
  ariaExpanded,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  ariaExpanded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-10 items-center justify-center rounded-md text-muted-foreground ring-offset-background transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground sm:size-8",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The live public-page preview — renders the REAL masthead + body from current builder state, at the
 * true public width (desktop 768 / phone 390) and CSS-zoom-scaled to fit the pane, so it is an
 * accurate miniature of the published page rather than a cramped narrow-width layout.
 */
function LivePreview({
  profile,
  educatorId,
  doc,
  hidesSomething,
  device,
  setDevice,
  scrollable,
  scrollRef,
}: {
  profile: PublicEducatorProfile;
  educatorId: string;
  doc: EducatorProfileDoc;
  hidesSomething: boolean;
  device: "desktop" | "phone";
  setDevice: (d: "desktop" | "phone") => void;
  scrollable?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const fallbackRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollRef ?? fallbackRef;
  const [paneWidth, setPaneWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setPaneWidth(el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [containerRef]);

  const deviceWidth = device === "phone" ? 390 : 768;
  const scale = paneWidth ? Math.min(1, paneWidth / deviceWidth) : 1;
  const stageStyle: React.CSSProperties = { width: deviceWidth, zoom: scale };

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Live preview</div>
          <div className="truncate text-xs text-muted-foreground">educators/{educatorId}</div>
        </div>
        <div
          role="radiogroup"
          aria-label="Preview width"
          className="flex items-center overflow-hidden rounded-md border border-border"
        >
          <button
            type="button"
            role="radio"
            aria-checked={device === "desktop"}
            aria-label="Desktop width"
            onClick={() => setDevice("desktop")}
            className={cn(
              "flex h-10 w-11 items-center justify-center sm:h-7 sm:w-8",
              device === "desktop" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Monitor className="h-4 w-4" />
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={device === "phone"}
            aria-label="Phone width"
            onClick={() => setDevice("phone")}
            className={cn(
              "flex h-10 w-11 items-center justify-center border-l border-border sm:h-7 sm:w-8",
              device === "phone" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Smartphone className="h-4 w-4" />
          </button>
        </div>
      </div>

      {hidesSomething ? (
        <p className="border-b border-border bg-background px-4 py-2 text-xs text-muted-foreground">
          Empty rows and sections are hidden here — they won&apos;t be published.
        </p>
      ) : null}

      <div
        ref={containerRef}
        className="bg-background"
        style={scrollable ? { maxHeight: "calc(100dvh - 9rem)", overflow: "auto" } : undefined}
      >
        <div className="mx-auto" style={stageStyle}>
          <div className="flex flex-col px-5 pb-6 sm:px-8">
            <ProfileHeader profile={profile} />
            <div className="h-px w-full bg-primary/40" aria-hidden />
            {doc.sections.length ? (
              <ProfileDoc doc={doc} educatorId={educatorId} tier={profile.tier} />
            ) : (
              <p className="py-10 text-sm text-muted-foreground">Add a section and it appears here.</p>
            )}
          </div>
        </div>
        <p className="px-4 pb-3 pt-2 text-center text-xs text-muted-foreground">
          {device === "phone"
            ? "Phone width — open View ↗ to test the true mobile layout."
            : "A scaled view of your live page — open View ↗ for the real thing."}
        </p>
      </div>
    </div>
  );
}

export function ProfileBuilder({
  educatorId,
  firstName,
  lastName,
  displayName,
  isVerified,
  tier,
  initialAvatarUrl,
  initialRoleLabel,
  initialHeadline,
  initialHourlyRateCents,
  initialSubjectTags,
  initialDoc,
  initialPublished,
  adminEdit = false,
}: ProfileBuilderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /* In admin mode every write targets `educatorId` (the educator being edited) through the
     admin-gated action variants; otherwise the self actions act on the signed-in educator. */
  const saveProfile = (input: SaveEducatorProfileInput) =>
    adminEdit ? adminSaveEducatorProfileAction(educatorId, input) : saveEducatorProfileAction(input);
  const setPublished = (publish: boolean) =>
    adminEdit ? adminSetProfilePublishedAction(educatorId, publish) : setProfilePublishedAction(publish);
  const editingName = getDisplayName(firstName, lastName, displayName);

  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [roleLabel, setRoleLabel] = useState(initialRoleLabel);
  const [headline, setHeadline] = useState(initialHeadline);
  const [hourlyRate, setHourlyRate] = useState(
    initialHourlyRateCents != null ? String(initialHourlyRateCents / 100) : "",
  );
  const [subjectTags, setSubjectTags] = useState<string[]>(initialSubjectTags);
  const [tagDraft, setTagDraft] = useState("");
  const [sections, setSections] = useState<ProfileSection[]>(initialDoc.sections);
  const [isPublished, setIsPublished] = useState(initialPublished);

  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [cleanupNote, setCleanupNote] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "phone">("desktop");

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [tipDismissed, setTipDismissed] = useState(true);
  const [isWide, setIsWide] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  /* Drive the side-by-side split from JS + inline styles rather than responsive arbitrary Tailwind
     classes, which the dev server can fail to regenerate on hot-reload (the pane would silently stack
     at the bottom). matchMedia is the source of truth for "wide enough for a live preview pane". */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /* On a phone the 768px desktop preview stage CSS-zooms to ~42%; default the preview to the phone stage. */
  useEffect(() => {
    if (!window.matchMedia("(min-width: 640px)").matches) setPreviewDevice("phone");
  }, []);

  /* Warn before losing unsaved work on tab-close / reload — same pattern as the upload manager. */
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    setTipDismissed(window.localStorage.getItem(TIP_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!pulseId) return;
    document.getElementById(`pb-section-${pulseId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = window.setTimeout(() => setPulseId(null), 1200);
    return () => window.clearTimeout(t);
  }, [pulseId]);

  const touch = () => {
    setDirty(true);
    setJustSaved(false);
  };

  const updateSection = (id: string, updated: ProfileSection) => {
    setSections((prev) => prev.map((s) => (s.id === id ? updated : s)));
    touch();
  };
  const removeSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    touch();
  };
  const moveSection = (index: number, dir: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    touch();
  };
  const addSection = (type: ProfileSectionType) => {
    const s = createSection(type);
    setSections((prev) => [...prev, s]);
    setPulseId(s.id);
    touch();
  };

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sectionHasContent = (section: ProfileSection): boolean => {
    try {
      return (
        validateProfileDoc({ version: EDUCATOR_PROFILE_DOC_VERSION, sections: [section] }).sections.length > 0
      );
    } catch {
      return true;
    }
  };
  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setSubjectTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    touch();
  };
  const removeTag = (t: string) => {
    setSubjectTags((prev) => prev.filter((x) => x !== t));
    touch();
  };

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setAvatarError("Use a PNG, JPG, or WEBP image.");
      return;
    }
    setPendingAvatarFile(file);
  };
  const handleAvatarCropped = async (cropped: File) => {
    setPendingAvatarFile(null);
    setAvatarError(null);
    setAvatarBusy(true);
    const res = await uploadEducatorImage(cropped, educatorId, "avatar");
    setAvatarBusy(false);
    if (res.error) {
      setAvatarError(res.error);
      return;
    }
    if (res.url) {
      setAvatarUrl(res.url);
      touch();
    }
  };
  const removeAvatar = () => {
    setAvatarUrl(null);
    setAvatarError(null);
    touch();
  };

  function buildInput() {
    const rate = hourlyRate.trim();
    const n = Number(rate);
    const hourlyRateCents = rate && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
    const doc: EducatorProfileDoc = { version: EDUCATOR_PROFILE_DOC_VERSION, sections };
    return {
      avatarUrl,
      roleLabel: roleLabel.trim() || null,
      headline: headline.trim() || null,
      hourlyRateCents,
      subjectTags: subjectTags.map((s) => s.trim()).filter(Boolean),
      doc,
    };
  }

  function computeCleanupNote(): string {
    try {
      const cleaned = validateProfileDoc({ version: EDUCATOR_PROFILE_DOC_VERSION, sections });
      return cleanupReport(sections, cleaned.sections);
    } catch {
      return "";
    }
  }

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await saveProfile(buildInput());
      if (res.error) {
        setError(res.error);
        return;
      }
      setCleanupNote(computeCleanupNote());
      setDirty(false);
      setJustSaved(true);
      router.refresh();
    });

  const publish = () => {
    setError(null);
    const input = buildInput();
    let cleaned: EducatorProfileDoc;
    try {
      cleaned = validateProfileDoc(input.doc);
    } catch (e) {
      setError(e instanceof ProfileValidationError ? e.message : "Your profile could not be validated.");
      return;
    }
    if (cleaned.sections.length === 0 && !input.headline) {
      setError("Add a heading or at least one filled-in section before publishing.");
      return;
    }
    startTransition(async () => {
      const saved = await saveProfile(input);
      if (saved.error) {
        setError(saved.error);
        return;
      }
      const pub = await setPublished(true);
      if (pub.error) {
        setError(pub.error);
        return;
      }
      setCleanupNote(cleanupReport(sections, cleaned.sections));
      setDirty(false);
      setJustSaved(true);
      setIsPublished(true);
      router.refresh();
    });
  };

  const unpublish = () =>
    startTransition(async () => {
      setError(null);
      const res = await setPublished(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setIsPublished(false);
      router.refresh();
    });

  /* Preview = what actually publishes: run the live doc through the same auto-clean validator the
     save uses, so empty/half-filled sections and blank pills don't mislead the educator. */
  const previewDoc = useMemo<EducatorProfileDoc>(() => {
    try {
      return validateProfileDoc({ version: EDUCATOR_PROFILE_DOC_VERSION, sections });
    } catch {
      return { version: EDUCATOR_PROFILE_DOC_VERSION, sections };
    }
  }, [sections]);

  const previewHidesSomething = useMemo(() => {
    const rawItems = sections.reduce((a, s) => a + countItems(s), 0);
    const cleanItems = previewDoc.sections.reduce((a, s) => a + countItems(s), 0);
    return sections.length !== previewDoc.sections.length || rawItems !== cleanItems;
  }, [sections, previewDoc]);

  const previewRateCents = useMemo(() => {
    const rate = hourlyRate.trim();
    const n = Number(rate);
    return rate && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  }, [hourlyRate]);

  /* A live PublicEducatorProfile assembled from current builder state so the preview renders the real
     public page — masthead included — exactly as it will publish. */
  const previewProfile = useMemo<PublicEducatorProfile>(
    () => ({
      educator_id: educatorId,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      avatar_url: avatarUrl,
      role_label: roleLabel.trim() || null,
      headline: headline.trim() || null,
      hourly_rate_cents: previewRateCents,
      subject_tags: subjectTags,
      profile_doc: previewDoc,
      is_verified: isVerified,
      tier,
      published_at: null,
    }),
    [
      educatorId,
      firstName,
      lastName,
      displayName,
      avatarUrl,
      roleLabel,
      headline,
      previewRateCents,
      subjectTags,
      previewDoc,
      isVerified,
      tier,
    ],
  );

  /* Section-anchored scroll sync: as the editor (the page) scrolls, drive the sticky preview pane so
     the section under the editor's top edge is shown in the preview. Maps editor section cards to the
     preview's rendered sections by id (only sections that survive auto-clean exist in both). */
  useEffect(() => {
    if (!isWide) return;
    const scroller = outerRef.current?.closest("main");
    const previewScroll = previewScrollRef.current;
    if (!scroller || !previewScroll) return;

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    let raf = 0;

    const sync = () => {
      raf = 0;
      const editorEls = [
        document.getElementById("pb-anchor-header"),
        ...previewDoc.sections.map((s) => document.getElementById(`pb-section-${s.id}`)),
      ];
      const previewEls = [
        previewScroll.querySelector("header"),
        ...Array.from(previewScroll.querySelectorAll("section")),
      ];
      if (
        editorEls.length !== previewEls.length ||
        editorEls.some((e) => !e) ||
        previewEls.some((e) => !e)
      ) {
        return;
      }
      const scrollerTop = scroller.getBoundingClientRect().top;
      const threshold = 96;
      const tops = (editorEls as HTMLElement[]).map((el) => el.getBoundingClientRect().top - scrollerTop);
      let i = 0;
      for (let k = 0; k < tops.length; k++) {
        if (tops[k] <= threshold) i = k;
        else break;
      }
      const next = Math.min(i + 1, tops.length - 1);
      const span = tops[next] - tops[i];
      const progress = span > 0 ? clamp((threshold - tops[i]) / span, 0, 1) : 0;
      const pTop = previewScroll.getBoundingClientRect().top;
      const offsetOf = (el: Element) => el.getBoundingClientRect().top - pTop + previewScroll.scrollTop;
      const o0 = offsetOf(previewEls[i] as Element);
      const o1 = offsetOf(previewEls[next] as Element);
      previewScroll.scrollTop = o0 + (o1 - o0) * progress - 12;
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    sync();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isWide, previewDoc]);

  const atMax = sections.length >= PROFILE_LIMITS.maxSections;
  const showFirstRun = !tipDismissed && sections.length === 0;
  const dismissTip = () => {
    window.localStorage.setItem(TIP_KEY, "1");
    setTipDismissed(true);
  };

  return (
    <div
      ref={outerRef}
      className="mx-auto w-full max-w-3xl p-4 sm:p-6"
      style={
        isWide
          ? { display: "flex", justifyContent: "center", alignItems: "flex-start", gap: "2rem", maxWidth: "none" }
          : undefined
      }
    >
      <div
        className="flex min-w-0 flex-col gap-6"
        style={isWide ? { flexBasis: "48rem", flexGrow: 0, flexShrink: 1, minWidth: 0 } : undefined}
      >
      <div className="sticky top-14 z-20 border-b border-border bg-background py-3 lg:top-0 lg:bg-background/80 lg:backdrop-blur lg:supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="shrink-0 text-xl font-black text-foreground">{adminEdit ? "Edit profile" : "My Profile"}</h1>
            {adminEdit ? (
              <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">— {editingName}</span>
            ) : null}
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
                isPublished ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn("size-1.5 rounded-full", isPublished ? "bg-primary" : "bg-muted-foreground/60")}
                aria-hidden
              />
              {isPublished ? "Live" : "Draft — hidden"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" asChild aria-label="View public page">
              <Link href={`/educators/${educatorId}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View</span>
              </Link>
            </Button>
            {!isWide ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview((v) => !v)}
                aria-label={showPreview ? "Hide preview" : "Show preview"}
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{showPreview ? "Hide preview" : "Preview"}</span>
              </Button>
            ) : null}
            <Button size="sm" onClick={save} loading={isPending} loadingText="Saving…">
              {justSaved && !dirty ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>{justSaved && !dirty ? "Saved" : "Save"}</span>
            </Button>
            {isPublished ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={unpublish}
                loading={isPending}
                aria-label="Unpublish"
                className="sm:px-2.5"
              >
                Unpublish
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={publish}
                loading={isPending}
                aria-label="Publish"
                className="sm:px-2.5"
              >
                Publish
              </Button>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : justSaved && !dirty ? (
        <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Saved.{cleanupNote ? ` ${cleanupNote}` : ""}
        </div>
      ) : dirty ? (
        <p className="text-xs text-muted-foreground">You have unsaved changes.</p>
      ) : null}

      {showFirstRun ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-primary/15 bg-primary/5 px-3 py-2 text-sm text-foreground">
          <span>
            <strong className="text-primary">Getting started:</strong> write a short bio, add your results, then
            hit Publish.
          </span>
          <button
            type="button"
            onClick={dismissTip}
            aria-label="Dismiss tip"
            className="relative shrink-0 rounded p-0.5 text-muted-foreground after:absolute after:-inset-3 after:content-[''] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <Card id="pb-anchor-header" className="flex flex-col gap-4 border-border p-5">
        <div>
          <h2 className="text-sm font-bold text-foreground">The top of your page</h2>
          <p className="text-xs text-muted-foreground">Your name is shown automatically.</p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
          {avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatarUrl}
              alt="Your profile photo"
              className="h-16 w-16 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-primary/10 text-lg font-black text-primary">
              {getInitials(firstName, lastName, displayName)}
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onAvatarFile}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarBusy}
              >
                {avatarBusy ? <Spinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                {avatarUrl ? "Replace photo" : "Upload photo"}
              </Button>
              {avatarUrl ? (
                <Button type="button" variant="ghost" size="sm" onClick={removeAvatar} disabled={avatarBusy}>
                  Remove
                </Button>
              ) : null}
            </div>
            {avatarError ? (
              <p className="text-xs text-destructive">{avatarError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Square image works best · PNG, JPG, WEBP · compressed automatically</p>
            )}
          </div>
        </div>
        {pendingAvatarFile && (
          <ImageCropModal
            file={pendingAvatarFile}
            shape="circle"
            title="Adjust your profile photo"
            onCancel={() => setPendingAvatarFile(null)}
            onCropped={handleAvatarCropped}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pb-role">Role label</Label>
            <Input
              id="pb-role"
              placeholder="e.g. IB Mathematics Educator"
              value={roleLabel}
              maxLength={120}
              onChange={(e) => {
                setRoleLabel(e.target.value);
                touch();
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pb-rate">Hourly rate (HKD)</Label>
            <Input
              id="pb-rate"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Leave blank for “Contact for rate”"
              value={hourlyRate}
              onChange={(e) => {
                setHourlyRate(e.target.value);
                touch();
              }}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pb-headline">Headline</Label>
          <Input
            id="pb-headline"
            placeholder="A one-line hook (≈50–75 characters)"
            value={headline}
            maxLength={160}
            onChange={(e) => {
              setHeadline(e.target.value);
              touch();
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pb-subjects">Subject tags</Label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-2 focus-within:ring-1 focus-within:ring-ring">
            {subjectTags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  aria-label={`Remove ${t}`}
                  className="relative text-muted-foreground after:absolute after:-inset-3 after:content-[''] hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              id="pb-subjects"
              value={tagDraft}
              placeholder={subjectTags.length ? "Add another…" : "Type a subject, press Enter"}
              className="min-w-28 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
              onChange={(e) => {
                const v = e.target.value;
                if (v.includes(",")) {
                  v.split(",").forEach(addTag);
                  setTagDraft("");
                } else {
                  setTagDraft(v);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagDraft);
                  setTagDraft("");
                } else if (e.key === "Backspace" && !tagDraft && subjectTags.length) {
                  removeTag(subjectTags[subjectTags.length - 1]);
                }
              }}
              onBlur={() => {
                if (tagDraft.trim()) {
                  addTag(tagDraft);
                  setTagDraft("");
                }
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Press Enter or comma to add each subject.</p>
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        {sections.map((section, index) => {
          const Icon = TYPE_ICON[section.type];
          const isCollapsed = collapsed.has(section.id);
          return (
            <Card
              key={section.id}
              id={`pb-section-${section.id}`}
              className={cn(
                "flex flex-col gap-3 border-border p-4 transition-colors hover:border-foreground/20 sm:p-5",
                pulseId === section.id && "ring-2 ring-ring",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="truncate text-sm font-semibold text-foreground">{TYPE_LABEL[section.type]}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">Section {index + 1}</span>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <div className="flex items-center overflow-hidden rounded-md border border-border">
                    <IconBtn
                      label="Move up"
                      className="rounded-none"
                      disabled={index === 0}
                      onClick={() => moveSection(index, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      label="Move down"
                      className="rounded-none border-l border-border"
                      disabled={index === sections.length - 1}
                      onClick={() => moveSection(index, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </IconBtn>
                  </div>
                  <IconBtn
                    label={isCollapsed ? "Expand section" : "Collapse section"}
                    ariaExpanded={!isCollapsed}
                    onClick={() => toggleCollapse(section.id)}
                  >
                    {isCollapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}
                  </IconBtn>
                  <ConfirmDeleteButton
                    label="Delete section"
                    confirmLabel="Permanently delete this section"
                    size="icon-sm"
                    className="size-10 sm:size-8"
                    requireConfirm={() => sectionHasContent(section)}
                    onConfirm={() => removeSection(section.id)}
                  />
                </div>
              </div>

              {isCollapsed ? (
                <p className="text-xs text-muted-foreground">{summarizeSection(section)}</p>
              ) : (
                <>
                  <Input
                    placeholder="Section heading (optional) — e.g. About me"
                    value={section.title ?? ""}
                    maxLength={120}
                    onChange={(e) => updateSection(section.id, { ...section, title: e.target.value || null })}
                  />
                  <AccentSwatches
                    value={section.accent ?? "none"}
                    title={section.title ?? null}
                    onChange={(accent) => updateSection(section.id, { ...section, accent })}
                  />
                  <SectionBodyEditor
                    section={section}
                    educatorId={educatorId}
                    onChange={(updated) => updateSection(section.id, updated)}
                  />
                </>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="flex flex-col gap-3 border-dashed border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold text-foreground">Add a section</div>
          <span className="text-xs text-muted-foreground">
            {sections.length} of {PROFILE_LIMITS.maxSections} sections
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {SECTION_CATALOG.map((meta) => {
            const Icon = TYPE_ICON[meta.type];
            return (
              <button
                key={meta.type}
                type="button"
                disabled={atMax}
                onClick={() => addSection(meta.type)}
                className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-left ring-offset-background transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-background"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{meta.label}</div>
                  <div className="text-xs text-muted-foreground">{meta.description}</div>
                  <div className="text-xs text-muted-foreground/70">{meta.example}</div>
                </div>
              </button>
            );
          })}
        </div>
        {atMax ? (
          <p className="text-xs text-muted-foreground">
            You&apos;ve reached the maximum of {PROFILE_LIMITS.maxSections} sections.
          </p>
        ) : null}
      </Card>

        {!isWide && showPreview ? (
          <LivePreview
            profile={previewProfile}
            educatorId={educatorId}
            doc={previewDoc}
            hidesSomething={previewHidesSomething}
            device={previewDevice}
            setDevice={setPreviewDevice}
          />
        ) : null}
      </div>

      {isWide ? (
        <aside style={{ width: "34rem", flexShrink: 0, position: "sticky", top: "1rem" }}>
          <LivePreview
            profile={previewProfile}
            educatorId={educatorId}
            doc={previewDoc}
            hidesSomething={previewHidesSomething}
            device={previewDevice}
            setDevice={setPreviewDevice}
            scrollable
            scrollRef={previewScrollRef}
          />
        </aside>
      ) : null}
    </div>
  );
}
