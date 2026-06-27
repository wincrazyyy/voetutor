/**
 * Single source of truth for what each educator tier unlocks. Both the builder and the public
 * renderer consult this; it is the config-flip surface for the deferred premium tier.
 *
 * v1: `basic` is the only production tier and is deliberately excellent — it ships every section
 * type the legacy sample uses. `premium` currently MIRRORS basic (no premium-only features built)
 * so nothing is locked or hidden, but the wiring is live: adding a premium feature later is a
 * one-line edit here, not a migration. See plans/educator-profile.md §10.
 */
import type { ProfileSectionType } from "@/lib/types/profile-doc";

export type EducatorTier = "basic" | "premium";

export interface TierCapabilities {
  /** Authorable AND renderable at this tier. */
  sectionTypes: readonly ProfileSectionType[];
  /** Total photos across the WHOLE profile (storage-cost ceiling), enforced in validateProfileDoc.
   *  Distinct from the per-section cap (PROFILE_LIMITS.photos.maxImages). */
  maxImages: number;
  maxSections: number;
  /** Max reviews an educator may carry on their profile (imported now; verified later). */
  maxReviews: number;
  /** Premium teaching features. Basic tier = public profile + reviews only. */
  classes: boolean;
  videos: boolean;
  questionBank: boolean;
  hideBranding: boolean;
  customSlug: boolean;
  customTheme: boolean;
}

export const CAPABILITIES: Record<EducatorTier, TierCapabilities> = {
  basic: {
    sectionTypes: ["text", "results", "lists", "photos", "links", "services"],
    maxImages: 12,
    maxSections: 24,
    maxReviews: 60,
    classes: false,
    videos: false,
    questionBank: false,
    hideBranding: false,
    customSlug: false,
    customTheme: false,
  },
  premium: {
    sectionTypes: ["text", "results", "lists", "photos", "links", "services"],
    maxImages: 12,
    maxSections: 24,
    maxReviews: 60,
    classes: true,
    videos: true,
    questionBank: true,
    hideBranding: false,
    customSlug: false,
    customTheme: false,
  },
} as const;

/** Union of every tier's authorable types — the SAVE-time allowlist (enables grandfathering). */
export const ALL_AUTHORABLE_SECTION_TYPES: readonly ProfileSectionType[] = Array.from(
  new Set(Object.values(CAPABILITIES).flatMap((c) => c.sectionTypes)),
);

export function capabilitiesFor(tier: EducatorTier | null | undefined): TierCapabilities {
  return CAPABILITIES[tier ?? "basic"];
}
