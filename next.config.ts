import type { NextConfig } from "next";

/* Pin the single Supabase Storage origin for the public profile pages (derived, never wildcarded). */
const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

/*
 * CSP on the public /educators/* pages. We deliberately omit default-src / script-src so Next's
 * inline hydration scripts keep working without a nonce pipeline (a nonce-based script-src lockdown
 * is a later hardening step). The meaningful protections here are: img-src pinned to our own
 * Supabase origin (browser-level backstop to the renderer's per-educator origin filter),
 * frame-ancestors 'none' (anti-clickjacking), and object-src 'none' (no plugins).
 */
const PROFILE_CSP = [
  `img-src 'self' ${SUPABASE_ORIGIN} data:`,
  "frame-ancestors 'none'",
  "object-src 'none'",
]
  .filter((d) => !d.endsWith(" "))
  .join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/educators/:path*",
        headers: [
          { key: "Content-Security-Policy", value: PROFILE_CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
