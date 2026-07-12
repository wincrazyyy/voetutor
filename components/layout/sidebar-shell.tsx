"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoeWordmark } from "@/components/brand/vault-mark";

interface SidebarShellProps {
  homeHref: string;
  children: React.ReactNode;
}

/**
 * Responsive chrome around the server-fetched sidebar content. On desktop (md and up) it renders the
 * original persistent w-64 column unchanged; below md it becomes an off-canvas drawer with a fixed
 * top bar (hamburger + logo) and a tap-to-dismiss backdrop. All transitions are transform/opacity
 * only and gated for reduced motion. State (open/close) lives here because the sidebar itself is a
 * server component and cannot own interactivity.
 */
export function SidebarShell({ homeHref, children }: SidebarShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  /* Close the drawer on navigation so tapping any nav link dismisses it. */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  /* Escape closes the drawer. */
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /* Lock body scroll while the mobile drawer is open; restore on close/unmount. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="app-sidebar"
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href={homeHref} className="hover:opacity-80 transition-opacity">
          <VoeWordmark />
        </Link>
      </header>

      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />

      <aside
        id="app-sidebar"
        className={cn(
          "w-64 bg-card border-r border-border flex flex-col shrink-0",
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out motion-reduce:transition-none",
          open ? "translate-x-0" : "-translate-x-full",
          "md:sticky md:inset-y-auto md:left-auto md:top-0 md:h-screen md:z-auto md:translate-x-0",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
          className="md:hidden absolute top-4 right-3 inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        {children}
      </aside>
    </>
  );
}
