/**
 * Validation limits for educator reviews — the single source of truth shared by the manage form and
 * the add/update server actions. The DB CHECK on educator_reviews.comment is 1500 (headroom for
 * hand-pasted legacy comments); the app form cap below is the tighter guard for new authored input.
 * Invariant: DB CHECK >= app cap. See plans/educator-reviews.md.
 */
export const REVIEW_LIMITS = {
  commentMax: 1000,
  nameMax: 80,
  schoolMax: 120,
  ratingMin: 1,
  ratingMax: 5,
} as const;
