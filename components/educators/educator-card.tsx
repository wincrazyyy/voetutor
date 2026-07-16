"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "motion/react";
import { ArrowRight, BadgeCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { getDisplayName, formatPrice } from "@/lib/utils/format";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { PublicEducatorCard } from "@/lib/types/database";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Hover-capable, fine-pointer device (skip 3D tilt on touch). */
function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine;
}

function rateLabel(cents: number | null): string {
  return cents != null && cents > 0 ? `${formatPrice(cents, "hkd")}/hr` : "Contact for rate";
}

/** The visual content of a card — shared by the static and 3D variants. Interior elements carry a
 *  `translateZ` (only when `depth` — the 3D tilt variant) so the tilt gets real depth-parallax as the
 *  card tilts (preserve-3d on parent); on touch/static cards the layers are dropped (no no-op GPU layers). */
function CardInner({ educator, depth }: { educator: PublicEducatorCard; depth: boolean }) {
  const name = getDisplayName(educator.first_name, educator.last_name, educator.display_name);
  const tags = (educator.subject_tags ?? []).filter(Boolean);

  return (
    <div className="relative flex h-full flex-col gap-4 rounded-[var(--radius)] bg-card p-5">
      <div className="flex items-start gap-3">
        <div style={depth ? { transform: "translateZ(40px)" } : undefined} className="shrink-0">
          <UserAvatar
            avatarUrl={educator.avatar_url}
            firstName={educator.first_name}
            lastName={educator.last_name}
            displayName={educator.display_name}
            size="lg"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-serif text-lg font-semibold leading-tight text-foreground">{name}</span>
            {educator.is_verified && educator.tier === "premium" ? (
              <span style={depth ? { transform: "translateZ(60px)" } : undefined} title="Verified educator">
                <BadgeCheck className="h-4 w-4 shrink-0 text-gold" aria-label="Verified educator" />
              </span>
            ) : null}
          </div>
          {educator.role_label ? (
            <p className="mt-0.5 line-clamp-2 text-xs font-medium uppercase tracking-wider text-muted-foreground xl:block xl:overflow-hidden xl:text-ellipsis xl:whitespace-nowrap">
              {educator.role_label}
            </p>
          ) : null}
        </div>
      </div>

      {educator.headline ? (
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{educator.headline}</p>
      ) : null}

      {tags.length ? (
        <div style={depth ? { transform: "translateZ(24px)" } : undefined} className="flex flex-wrap gap-1.5">
          {tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              {t}
            </span>
          ))}
          {tags.length > 2 ? (
            <span className="rounded-full px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              +{tags.length - 2}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        style={depth ? { transform: "translateZ(16px)" } : undefined}
        className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-3"
      >
        <span className="text-sm font-semibold tabular-nums text-foreground">{rateLabel(educator.hourly_rate_cents)}</span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          View profile
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/card:translate-x-0.5" />
        </span>
      </div>
    </div>
  );
}

export interface EducatorCardProps {
  educator: PublicEducatorCard;
  /** Enable the CSS-3D pointer tilt (hero rack). Off → a flat, static card (directory grid). */
  interactive?: boolean;
  /** Spotlight: dim+blur this card because a sibling in the rack is active. */
  dimmed?: boolean;
  /** Fired when the card becomes the active (hovered/focused) one, so a parent can spotlight it. */
  onActiveChange?: (active: boolean) => void;
  className?: string;
}

const TILT_SPRING = { stiffness: 220, damping: 26, mass: 0.6 };

export function EducatorCard({ educator, interactive, dimmed, onActiveChange, className }: EducatorCardProps) {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  const tiltOn = Boolean(interactive) && !reduced && fine;

  const ref = useRef<HTMLAnchorElement>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const px = useMotionValue(0.5);
  const rotateX = useSpring(rx, TILT_SPRING);
  const rotateY = useSpring(ry, TILT_SPRING);
  const sheenX = useTransform(useSpring(px, { stiffness: 120, damping: 20 }), [0, 1], ["-35%", "35%"]);

  const href = `/educators/${educator.educator_id}`;
  const baseClass = cn(
    "group/card relative block h-full rounded-[var(--radius)] outline-none ring-offset-background transition-[opacity,filter] duration-300",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    dimmed && "opacity-60 blur-[2px]",
    className,
  );

  const shell = (
    <>
      {/* contact + ambient shadow + gold top hairline live on the shell so they don't tilt the text plate */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[var(--radius)] border border-border shadow-[0_1px_2px_rgba(0,0,0,0.04),0_30px_80px_-28px_hsl(var(--primary)/0.28)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[var(--radius)] bg-gradient-to-r from-transparent via-gold/40 to-transparent"
        aria-hidden
      />
      <CardInner educator={educator} depth={tiltOn} />
      {/* spotlight ring on hover/focus */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[var(--radius)] opacity-0 ring-1 ring-inset ring-gold/50 transition-opacity duration-200 group-hover/card:opacity-100 group-focus-visible/card:opacity-100"
        aria-hidden
      />
    </>
  );

  if (!tiltOn) {
    return (
      <Link
        href={href}
        ref={ref}
        className={cn(
          baseClass,
          "bg-card transition-transform duration-150 will-change-transform hover:-translate-y-1",
        )}
        onPointerEnter={() => onActiveChange?.(true)}
        onPointerLeave={() => onActiveChange?.(false)}
        onFocus={() => onActiveChange?.(true)}
        onBlur={() => onActiveChange?.(false)}
        aria-label={`${getDisplayName(educator.first_name, educator.last_name, educator.display_name)} — view profile`}
      >
        {shell}
      </Link>
    );
  }

  const handleMove = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    ry.set(clamp(nx * 18, -9, 9));
    rx.set(clamp(-ny * 14, -7, 7));
    px.set(nx + 0.5);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
    px.set(0.5);
    onActiveChange?.(false);
  };

  return (
    <motion.a
      ref={ref}
      href={href}
      className={cn(baseClass, "[perspective:1000px]")}
      style={{ transformStyle: "preserve-3d" }}
      onPointerMove={handleMove}
      onPointerEnter={() => onActiveChange?.(true)}
      onPointerLeave={reset}
      onFocus={() => onActiveChange?.(true)}
      onBlur={() => onActiveChange?.(false)}
      aria-label={`${getDisplayName(educator.first_name, educator.last_name, educator.display_name)} — view profile`}
    >
      <motion.div
        className="relative h-full rounded-[var(--radius)]"
        style={{ rotateX, rotateY, transformStyle: "preserve-3d", willChange: "transform" }}
      >
        {shell}
        {/* gold specular sheen sweeps with the pointer */}
        <motion.div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius)] opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
          style={{ transform: "translateZ(70px)" }}
          aria-hidden
        >
          <motion.div
            className="absolute inset-y-0 -inset-x-1/2 bg-[linear-gradient(105deg,transparent_38%,hsl(var(--accent-gold)/0.16)_50%,transparent_62%)]"
            style={{ x: sheenX }}
          />
        </motion.div>
      </motion.div>
    </motion.a>
  );
}
