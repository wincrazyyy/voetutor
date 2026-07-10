import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The single spinner primitive. Wraps lucide `Loader2` + `animate-spin` and inherits `currentColor`
 * by default, so it takes the surrounding button/text color for free. Size defaults to `size-4`;
 * pass `className` (e.g. `size-3.5`, `text-primary`) or a `size` in px for the few overlay cases.
 * Decorative by default (aria-hidden); pass a `label` to announce it as a live status.
 */
export function Spinner({
  className,
  size,
  label,
}: {
  className?: string;
  size?: number;
  label?: string;
}) {
  return (
    <Loader2
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "status" : undefined}
      className={cn("animate-spin", !size && "size-4", className)}
      style={size ? { width: size, height: size } : undefined}
    />
  );
}
