/**
 * Canonical site identity + absolute base URL, shared by the root metadata, the web manifest,
 * robots, and the sitemap so social-share cards, canonical links, and crawler directives all
 * resolve against ONE stable origin.
 *
 * Origin precedence: an explicit NEXT_PUBLIC_APP_URL wins; then Vercel's stable PRODUCTION domain
 * (never a per-deploy preview host); then the current deploy URL; then localhost. Using the
 * production domain — not VERCEL_URL — keeps shared links pointing at the live site.
 */
function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "VOETutor";
export const SITE_TITLE = "VOETutor — Vault of Excellence | Premium IB Tutoring";
export const SITE_DESCRIPTION =
  "The Vault of Excellence — a curated marketplace of vetted IB educators. Browse specialist tutors, watch HD video lessons, and learn on demand.";
