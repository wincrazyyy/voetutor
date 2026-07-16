import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { getDisplayName, formatPrice } from "@/lib/utils/format";
import { imageAllowed } from "@/components/profile/render/photos";
import type { PublicEducatorProfile } from "@/lib/types/database";

/**
 * Identity masthead for the public profile — a typeset editorial "calling card", NOT a bordered card.
 * Two stacked bands inside the body's own column grid (so it flows into the left-led folio body):
 *   1. IDENTITY — a featured 4:5-ish portrait that `self-stretch`es to the exact height of the
 *      name/role/headline beside it (so nothing ever dangles, for any text length), or a clean text
 *      masthead when there is no photo.
 *   2. ENGAGEMENT — rate + "coming soon" booking on the left, the live "See classes" link on the
 *      right: one balanced counterweight row under a hairline, not a detached strip.
 * Degrades gracefully when avatar / tags / rate are absent. No "Free", no empty frame, no dead button.
 * The "See classes" CTA is gated behind `showClassesCta` (the server page passes the
 * CLASS_BROWSE_ENABLED flag; this component also renders inside the client builder preview, so it
 * cannot read the server-only flag itself).
 */
export function ProfileHeader({
  profile,
  showClassesCta = false,
}: {
  profile: PublicEducatorProfile;
  showClassesCta?: boolean;
}) {
  const name = getDisplayName(profile.first_name, profile.last_name, profile.display_name);
  const first = (profile.first_name ?? name).trim().split(/\s+/)[0];
  const classesLabel = first ? `See ${first}'s classes` : "See classes";
  const avatarOk = Boolean(profile.avatar_url && imageAllowed(profile.avatar_url, profile.educator_id));
  const rateIsSet = profile.hourly_rate_cents != null;
  const rate = rateIsSet ? formatPrice(profile.hourly_rate_cents as number, "hkd") : "Contact for rate";
  const tags = profile.subject_tags ?? [];

  return (
    <header className="grid grid-cols-1 pb-9 pt-12 sm:pb-10 sm:pt-16 lg:grid-cols-[3rem_1fr] lg:gap-x-6">
      <div className="flex flex-col gap-y-7 lg:col-start-2">
        {/* Band 1 — identity */}
        <div className="flex items-stretch gap-4 sm:gap-7">
          {avatarOk && profile.avatar_url ? (
            <div className="relative w-24 shrink-0 self-stretch overflow-hidden rounded-[var(--radius)] border border-border bg-muted ring-1 ring-primary/10 min-h-[8.5rem] sm:w-32 sm:min-h-[10rem] lg:w-36 dark:ring-primary/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profile.avatar_url} alt={name} className="block h-full w-full object-cover object-center" />
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            {profile.role_label ? (
              <div className="flex items-start gap-2.5 sm:items-center">
                <span className="mt-2 h-px w-6 shrink-0 bg-primary sm:mt-0" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {profile.role_label}
                </span>
              </div>
            ) : !avatarOk ? (
              <span className="block h-px w-8 bg-primary" aria-hidden />
            ) : null}

            <h1
              className={cn(
                "mt-2.5 text-balance break-words font-serif text-[1.75rem] font-semibold leading-[1.06] tracking-[-0.02em] text-foreground sm:text-[2.75rem]",
                avatarOk ? "max-w-[16ch] lg:text-5xl" : "max-w-[20ch] lg:text-6xl",
              )}
            >
              {name}
              {profile.is_verified && profile.tier === "premium" ? (
                <span title="Verified educator" className="ml-2 inline-flex align-middle">
                  <BadgeCheck
                    className="h-6 w-6 text-primary sm:h-7 sm:w-7"
                    role="img"
                    aria-label="Verified educator"
                  />
                </span>
              ) : null}
            </h1>

            {profile.headline ? (
              <p
                className={cn(
                  "mt-3 text-base leading-relaxed text-foreground/85 sm:text-lg",
                  avatarOk ? "max-w-[42ch]" : "max-w-[46ch]",
                )}
              >
                {profile.headline}
              </p>
            ) : null}

            {tags.length ? (
              <div className="mt-4">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Teaches
                </span>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tags.map((t, i) => (
                    <span key={i}>
                      {i > 0 ? <span className="text-muted-foreground/40"> · </span> : null}
                      {t}
                    </span>
                  ))}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Band 2 — engagement */}
        <div className="border-t border-border pt-6">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Private tutoring
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <span className="text-2xl font-bold text-foreground">{rate}</span>
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Booking · coming soon
                </span>
              </div>
            </div>
            {showClassesCta ? (
              <Link
                href="/classes"
                className="relative inline-flex items-center text-sm font-semibold text-primary after:absolute after:-inset-2 after:content-[''] hover:underline sm:text-right sm:after:hidden"
              >
                {classesLabel} →
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
