/** Shared announcement limits — enforced in app/actions/announcements.ts and surfaced in the form.
 *  Title cap mirrors the announcements.title DB CHECK (255). */
export const ANNOUNCEMENT_LIMITS = {
  titleMin: 1,
  titleMax: 255,
  bodyMin: 1,
  bodyMax: 8000,
} as const;
