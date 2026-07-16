"use client";

import NextTopLoader from "nextjs-toploader";

/**
 * Global top-of-page navigation progress bar, covering the gap before a route segment's `loading.tsx`
 * mounts (and the public tree, which has no `loading.tsx`). Themed to the brand teal; mounted once at
 * the root layout.
 *
 * It only self-triggers on `<Link>` clicks and server-action `redirect()`. An imperative
 * `router.push` from `next/navigation` does NOT raise it — measured, despite what this comment used
 * to claim. Any client component that navigates imperatively must import `useRouter` from
 * `nextjs-toploader/app` instead, which starts the bar on push/replace and ends it on the pathname
 * change (the auth forms do).
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
