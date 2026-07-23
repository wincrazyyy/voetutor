"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { setEducatorTierAction, setEducatorVerifiedAction } from "@/app/actions/educators";
import { adminSetProfilePublishedAction } from "@/app/actions/educator-profile";
import { cn } from "@/lib/utils";
import type { EducatorTier } from "@/lib/types/database";

type ControlKey = "tier" | "verified" | "published";

interface EducatorAdminControlsProps {
  educatorId: string;
  tier: EducatorTier;
  isVerified: boolean;
  isPublished: boolean;
  /** True when the profile is live or has draft content — a bare/absent row keeps Publish disabled. */
  canPublish: boolean;
}

function StatePill({ active, activeLabel, inactiveLabel, activeClassName }: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  activeClassName: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        active ? activeClassName : "bg-muted text-muted-foreground",
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

/**
 * The tier / verified / published admin control card. Tier and verified wrap the two admin RPCs
 * (materialising the educator_profiles row first, so a "none"-state educator works); published
 * reuses adminSetProfilePublishedAction. Publish is gated on canPublish — the page derives it from
 * the SAME live/draft/none predicate as the header pill, so a bare row materialised by a tier or
 * verified toggle never lets an admin publish a completely empty public profile. Per-action busy
 * key: only the clicked row's button spins while the other rows lock.
 */
export function EducatorAdminControls({
  educatorId,
  tier,
  isVerified,
  isPublished,
  canPublish,
}: EducatorAdminControlsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<ControlKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (key: ControlKey, fn: () => Promise<{ error?: string }>) => {
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else router.refresh();
      setBusy(null);
    });
  };

  const isPremium = tier === "premium";

  return (
    <Card className="border-border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="mb-1 text-lg font-bold">Admin controls</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Tier, verification and public visibility. Changes apply immediately.
      </p>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Tier</span>
              {isPremium ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                  <Crown className="h-3 w-3" />
                  Premium
                </span>
              ) : (
                <StatePill
                  active={false}
                  activeLabel="Premium"
                  inactiveLabel="Basic"
                  activeClassName="bg-gold/10 text-gold"
                />
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Premium unlocks classes, the content library and the question bank.
            </p>
          </div>
          <Button
            variant={isPremium ? "outline" : "default"}
            size="sm"
            className="shrink-0"
            loading={pending && busy === "tier"}
            loadingText="Updating…"
            disabled={pending && busy !== "tier"}
            onClick={() =>
              run("tier", () => setEducatorTierAction(educatorId, isPremium ? "basic" : "premium"))
            }
          >
            {isPremium ? "Downgrade to basic" : "Upgrade to premium"}
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Verified badge</span>
              <StatePill
                active={isVerified}
                activeLabel="Verified"
                inactiveLabel="Not verified"
                activeClassName="bg-primary/10 text-primary"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              The badge only displays publicly for premium educators.
            </p>
          </div>
          <Button
            variant={isVerified ? "outline" : "default"}
            size="sm"
            className="shrink-0"
            loading={pending && busy === "verified"}
            loadingText="Updating…"
            disabled={pending && busy !== "verified"}
            onClick={() => run("verified", () => setEducatorVerifiedAction(educatorId, !isVerified))}
          >
            {isVerified ? "Remove verification" : "Mark verified"}
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Public profile</span>
              <StatePill
                active={isPublished}
                activeLabel="Live"
                inactiveLabel="Hidden"
                activeClassName="bg-primary/10 text-primary"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {canPublish
                ? "Controls whether the public profile page is visible to visitors."
                : "Nothing to publish yet — this educator's profile has no content."}
            </p>
          </div>
          <Button
            variant={isPublished ? "outline" : "default"}
            size="sm"
            className="shrink-0"
            loading={pending && busy === "published"}
            loadingText="Updating…"
            disabled={!canPublish || (pending && busy !== "published")}
            onClick={() =>
              run("published", () => adminSetProfilePublishedAction(educatorId, !isPublished))
            }
          >
            {isPublished ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </Card>
  );
}
