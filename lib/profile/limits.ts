/**
 * Validation limits for the educator profile document — the single source of truth shared by the
 * builder, the save server action, and the legacy importer. See plans/educator-profile.md §2.
 */
export const PROFILE_LIMITS = {
  maxSections: 24,
  maxDocBytes: 192 * 1024,
  section: { titleMax: 120 },
  text: { maxBlocks: 60, maxChars: 6000, maxListDepth: 2 },
  results: { maxCards: 8, titleMax: 80, valueMax: 24, helperMax: 60 },
  lists: { maxColumns: 4, maxPillsPerColumn: 40, pillMin: 1, pillMax: 80, countLabelMax: 24 },
  photos: { maxImages: 8, altMin: 1, altMax: 200, captionMax: 200 },
  links: { maxLinks: 20, labelMax: 120 },
  services: { maxItems: 12, nameMax: 120, priceLabelMax: 40, descriptionMax: 400 },
  link: { allowedProtocols: ["https:"] as const },
  /** Values auto-normalized to null on save / import (kills the legacy public "… items" leak). */
  genericLabels: ["items", "image"] as const,
} as const;
