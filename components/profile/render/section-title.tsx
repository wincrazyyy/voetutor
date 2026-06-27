import { cn } from "@/lib/utils";
import type { SectionAccent } from "@/lib/types/profile-doc";

/**
 * Section heading — an underline-rule subhead (the magazine idiom), not a filled chip. The accent is
 * the only colour an educator can apply and it is theme-locked, expressed as a thin rule + a coloured
 * folio numeral: `primary` is teal, `gold` is the gold token, `none` is a quiet border rule. There is
 * no per-character / free colour anywhere.
 */
export const ACCENT_BAR: Record<SectionAccent, string> = {
  none: "bg-border",
  primary: "bg-primary",
  gold: "bg-[hsl(var(--accent-gold))]",
};

export const ACCENT_TEXT: Record<SectionAccent, string> = {
  none: "text-muted-foreground",
  primary: "text-primary",
  gold: "text-[hsl(var(--accent-gold))]",
};

export function SectionTitle({
  title,
  accent,
  folio,
}: {
  title: string;
  accent: SectionAccent;
  folio?: string;
}) {
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        {folio ? (
          <span className={cn("mr-2 tabular-nums lg:hidden", ACCENT_TEXT[accent])}>{folio} ·</span>
        ) : null}
        {title}
      </h2>
      <span aria-hidden className={cn("mt-2 block h-0.5 w-10 rounded-full", ACCENT_BAR[accent])} />
    </div>
  );
}
