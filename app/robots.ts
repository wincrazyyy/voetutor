import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/config/site";

/**
 * Allow the public marketing surfaces (home, the educators directory + public profiles, legal
 * pages) and keep crawlers out of the auth-gated app and utility routes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/onboarding/",
        "/welcome/",
        "/invite/",
        "/maintenance",
        "/dashboard",
        "/admin",
        "/settings",
        "/approvals",
        "/reports",
        "/pending",
        "/question-bank",
        "/library",
        "/profile",
        "/reviews",
        "/classes",
        "/class/",
        "/lesson/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
