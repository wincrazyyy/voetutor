import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/config/site";

/**
 * The public, crawlable surfaces. Per-educator public profiles (`/educators/[id]`) can be added
 * here from `list_published_educators` when a fuller SEO pass is scoped.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/educators`, lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: "monthly", priority: 0.3 },
  ];
}
