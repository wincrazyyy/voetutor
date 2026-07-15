import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION } from "@/lib/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VOETutor — Vault of Excellence",
    short_name: "VOETutor",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#08312c",
    theme_color: "#0d9488",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
