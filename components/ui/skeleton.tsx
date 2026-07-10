import { cn } from "@/lib/utils";

/**
 * Placeholder loading block — a pulsing muted rectangle. Compose these to match a route's real layout
 * inside its `loading.tsx` (see components/loading/*), or use inline anywhere a value is loading.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
