"use client";

import { useLinkStatus } from "next/link";

import { Spinner } from "@/components/ui/spinner";

/**
 * Per-link pending indicator. Rendered INSIDE a `<Link>`, it reads that link's own navigation state
 * via `useLinkStatus()` (Next 15.3+) and shows a spinner while the click is in flight — instant
 * acknowledgement on the exact item the user clicked (primary use: the sidebar nav + class rows).
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className={className ?? "size-3.5 opacity-70"} />;
}
