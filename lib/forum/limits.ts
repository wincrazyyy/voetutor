/** Shared forum content limits — enforced server-side in app/actions/forum.ts and surfaced as
 *  character counters in the composers. The title cap mirrors the forum_posts.title DB CHECK (255). */
export const FORUM_LIMITS = {
  titleMin: 3,
  titleMax: 255,
  postBodyMin: 1,
  postBodyMax: 10000,
  replyMin: 1,
  replyMax: 10000,
  /** Visual indent cap for the comment tree — deeper replies render flattened at this depth. */
  maxVisualNestingDepth: 6,
} as const;
