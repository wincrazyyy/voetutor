import type { ColumnCount } from "@/lib/types/profile-doc";

/**
 * Column-count enum -> static Tailwind classes. NEVER an interpolated `grid-cols-${n}` — Tailwind
 * cannot purge dynamically-built class names, so every variant is spelled out literally here.
 */
const GRID: Record<string, string> = {
  "1": "grid-cols-1",
  "2": "grid-cols-1 sm:grid-cols-2",
  "3": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  "4": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  auto: "grid-cols-1 sm:grid-cols-3 lg:grid-cols-4",
};

export function gridClass(cols: ColumnCount): string {
  return GRID[String(cols)] ?? GRID.auto;
}
