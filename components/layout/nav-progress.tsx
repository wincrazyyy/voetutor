"use client";

import NextTopLoader from "nextjs-toploader";

/**
 * Global top-of-page navigation progress bar. Gives instant click feedback for EVERY navigation —
 * `<Link>` clicks, imperative `router.push`, and server-action `redirect()` — covering the gap before
 * a route segment's `loading.tsx` mounts (and the public tree, which has no `loading.tsx`). Themed to
 * the brand teal; mounted once at the root layout.
 */
export function NavProgress() {
  return (
    <NextTopLoader
      color="hsl(var(--primary))"
      height={3}
      shadow="0 0 8px hsl(var(--primary)), 0 0 4px hsl(var(--primary))"
      showSpinner={false}
      crawlSpeed={200}
      speed={300}
      zIndex={9999}
    />
  );
}
