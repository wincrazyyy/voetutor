import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Display-only star row for a 1–5 rating (server component). Teal fill ties to the profile accent;
 * gold stays reserved for the verified badge. Rounds to the nearest whole star.
 */
export function StarRating({
  rating,
  className,
  starClassName,
  label,
}: {
  rating: number;
  className?: string;
  starClassName?: string;
  label?: string;
}) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={label ?? `${filled} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            "h-4 w-4",
            i < filled ? "fill-primary text-primary" : "fill-none text-muted-foreground/30",
            starClassName,
          )}
        />
      ))}
    </div>
  );
}
