import Link from "next/link";
import { Crown, ExternalLink, Pencil, ShieldCheck, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatPrice, getDisplayName, relativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { EducatorProfile, Profile } from "@/lib/types/database";
import type { EducatorReviewSummary } from "@/lib/queries/educator-insights";

type ProfileState = "live" | "draft" | "none";

const STATE_PILL: Record<ProfileState, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-primary/10 text-primary" },
  draft: { label: "Draft — hidden", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  none: { label: "No profile yet", className: "bg-muted text-muted-foreground" },
};

interface EducatorHudHeaderProps {
  target: Profile;
  educatorProfile: EducatorProfile | null;
  profileState: ProfileState;
  reviews: EducatorReviewSummary;
  verifiedByName: string | null;
}

/**
 * Identity masthead of the admin educator HUD: avatar, name, every status badge, the profile
 * headline/tags, a compact meta strip, and the three navigation action buttons. View public is
 * disabled while the profile isn't live so it never dead-ends on a 404. Avatar precedence matches
 * profiles_public (account avatar first, masthead fallback) so the HUD shows the same face as the
 * rest of the app.
 */
export function EducatorHudHeader({
  target,
  educatorProfile,
  profileState,
  reviews,
  verifiedByName,
}: EducatorHudHeaderProps) {
  const ep = educatorProfile;
  const name = getDisplayName(target.first_name, target.last_name, target.display_name);
  const pill = STATE_PILL[profileState];

  return (
    <Card className="border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <UserAvatar
            avatarUrl={target.avatar_url ?? ep?.avatar_url ?? null}
            firstName={target.first_name}
            lastName={target.last_name}
            displayName={target.display_name}
            size="lg"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-words text-xl font-bold text-foreground">{name}</h2>
              {target.role === "admin" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
                  <ShieldCheck className="h-3 w-3" />
                  Admin
                </span>
              ) : null}
              {ep?.tier === "premium" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                  <Crown className="h-3 w-3" />
                  Premium
                </span>
              ) : null}
              {ep?.is_verified ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary"
                  title={
                    ep.verified_at
                      ? `Verified ${relativeTime(ep.verified_at)}${verifiedByName ? ` by ${verifiedByName}` : ""}`
                      : verifiedByName
                        ? `Verified by ${verifiedByName}`
                        : undefined
                  }
                >
                  Verified
                </span>
              ) : null}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                  pill.className,
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    profileState === "live"
                      ? "bg-primary"
                      : profileState === "draft"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/60",
                  )}
                  aria-hidden
                />
                {pill.label}
              </span>
              {target.role === "educator" && !target.is_approved ? (
                <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Awaiting approval
                </span>
              ) : null}
            </div>

            {ep?.role_label ? (
              <p className="mt-1 text-sm text-muted-foreground">{ep.role_label}</p>
            ) : null}
            {ep?.headline ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{ep.headline}</p>
            ) : null}

            {(ep?.subject_tags?.length ?? 0) > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {ep?.subject_tags?.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>Joined {relativeTime(target.created_at)}</span>
              {target.approved_at ? (
                <span>Approved {relativeTime(target.approved_at)}</span>
              ) : null}
              {ep?.is_verified && verifiedByName ? <span>Verified by {verifiedByName}</span> : null}
              {ep?.hourly_rate_cents != null ? (
                <span>{formatPrice(ep.hourly_rate_cents, "hkd")}/hr</span>
              ) : null}
              {ep ? (
                <span>
                  {ep.profile_doc?.sections?.length ?? 0} profile{" "}
                  {(ep.profile_doc?.sections?.length ?? 0) === 1 ? "section" : "sections"}
                </span>
              ) : null}
              {ep?.is_published && ep.published_at ? (
                <span>Published {relativeTime(ep.published_at)}</span>
              ) : null}
              {ep?.slug ? (
                <span>
                  Slug <span className="font-mono text-foreground/80">{ep.slug}</span>
                </span>
              ) : null}
              {reviews.visible > 0 && reviews.average_visible_rating != null ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 fill-gold text-gold" aria-hidden />
                  {reviews.average_visible_rating} ({reviews.visible}{" "}
                  {reviews.visible === 1 ? "review" : "reviews"})
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          <Button size="sm" asChild>
            <Link href={`/admin/educators/${target.id}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit profile
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/educators/${target.id}/reviews`}>
              <Star className="h-4 w-4" />
              Manage reviews
            </Link>
          </Button>
          {profileState === "live" ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/educators/${target.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                View public
              </Link>
            </Button>
          ) : (
            <span title="This profile isn't public yet" className="inline-flex">
              <Button
                variant="outline"
                size="sm"
                disabled
                aria-label="View public profile — not public yet"
              >
                <ExternalLink className="h-4 w-4" />
                View public
              </Button>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
