"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { ACCENT_BAR, ACCENT_TEXT } from "@/components/profile/render/section-title";
import type { SectionAccent } from "@/lib/types/profile-doc";

/**
 * Replaces the native Accent <select>. Three tactile swatches + a live mini-subhead that reproduces
 * the public SectionTitle idiom (coloured folio + underline rule) token-for-token via the shared
 * ACCENT_BAR / ACCENT_TEXT maps — so the educator SEES what "accent" does instead of reading a word.
 */
const OPTIONS: { value: SectionAccent; label: string; swatch: string; check: string }[] = [
  { value: "none", label: "No accent", swatch: "border-2 border-border bg-transparent", check: "text-foreground" },
  { value: "primary", label: "Teal accent", swatch: "bg-primary", check: "text-primary-foreground" },
  {
    value: "gold",
    label: "Gold accent",
    swatch: "bg-[hsl(var(--accent-gold))]",
    check: "text-[hsl(var(--accent-gold-foreground))]",
  },
];

export function AccentSwatches({
  value,
  onChange,
  title,
}: {
  value: SectionAccent;
  onChange: (a: SectionAccent) => void;
  title: string | null;
}) {
  const idx = OPTIONS.findIndex((o) => o.value === value);
  const move = (dir: number) => onChange(OPTIONS[(idx + dir + OPTIONS.length) % OPTIONS.length].value);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Accent</span>
        <div
          role="radiogroup"
          aria-label="Section accent"
          className="flex items-center gap-3 sm:gap-2"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            }
          }}
        >
          {OPTIONS.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={o.label}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(o.value)}
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:size-7",
                  o.swatch,
                  selected && "ring-2 ring-foreground ring-offset-2",
                )}
              >
                {o.value === "none" ? (
                  <span aria-hidden className="absolute h-px w-5 -rotate-45 bg-border" />
                ) : null}
                {selected ? <Check className={cn("relative h-3.5 w-3.5", o.check)} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-base font-semibold tracking-tight text-foreground">
          <span className={cn("mr-1.5 text-xs font-semibold tabular-nums", ACCENT_TEXT[value])}>01 ·</span>
          {title?.trim() || "Section heading"}
        </div>
        <span aria-hidden className={cn("mt-1 block h-0.5 w-10 rounded-full", ACCENT_BAR[value])} />
      </div>
    </div>
  );
}
