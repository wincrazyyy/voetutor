import { cn } from "@/lib/utils";

/**
 * The VOE crest — a heater shield whose interior reads as BOTH a serif "V" and a vault keyhole (a round
 * bore over a serifed V-keyway), with a single gold accent: a lit lock-tumbler bar inside the bore. The
 * shield fills with `currentColor` (inherits teal, or white on dark backgrounds); the keyhole is negative
 * space (knocked out via even-odd) so the gold tumbler reads on the page background, never muddy on teal.
 * Pure presentational SVG — server-renderable, no client JS. The intro's vault dial reuses this same
 * keyhole, so the mark, the dial that unlocks the doors, and the navbar logo are one identity.
 *
 * `compact` thickens the gold tumbler for favicon-tier / <=20px usages so it can't sub-pixel away.
 */
export function VaultMark({
  className,
  title,
  compact,
}: {
  className?: string;
  title?: string;
  compact?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("h-7 w-7", className)}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.5 5 H25.5 A1.6 1.6 0 0 1 27 6.6 V14.6 C27 21.8 22 25.9 16 28.6 C10 25.9 5 21.8 5 14.6 V6.6 A1.6 1.6 0 0 1 6.5 5 Z
           M13.7 9.4 a2.3 2.3 0 1 1 4.6 0 a2.3 2.3 0 1 1 -4.6 0 Z
           M13.4 13.3 L11.2 19.4 L13.9 19.4 L16 16.4 L18.1 19.4 L20.8 19.4 L18.6 13.3 Z"
      />
      <rect
        x={compact ? 14.1 : 14.3}
        y={compact ? 8.55 : 8.7}
        width={compact ? 3.8 : 3.4}
        height={compact ? 1.6 : 1.3}
        rx={compact ? 0.5 : 0.65}
        fill="hsl(var(--accent-gold))"
        className="opacity-90 transition-[transform,opacity] duration-300 [transform-box:fill-box] [transform-origin:center] group-hover:scale-110 group-hover:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
    </svg>
  );
}

/**
 * The full brand lockup: VOE keyhole crest + a two-line "VAULT OF EXCELLENCE" wordmark set in Cinzel
 * (the prestige crest face), with "OF" in gold. Used in the navbar / sidebar / auth. Pass
 * `tone="onPrimary"` on a teal/coloured background for light text. On hover the shield lifts and the
 * gold tumbler catches the light ("the lock catches the light") — suppressed under reduced motion.
 */
export function VoeWordmark({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "onPrimary";
}) {
  const onPrimary = tone === "onPrimary";
  const textColor = onPrimary ? "text-primary-foreground" : "text-foreground";
  const shieldColor = onPrimary ? "text-primary-foreground" : "text-primary";
  const ofColor = onPrimary ? "text-primary-foreground/70" : "text-gold";

  return (
    <span className={cn("group inline-flex items-center gap-2.5", className)}>
      <VaultMark
        className={cn(
          "h-9 w-9 shrink-0 origin-center transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
          shieldColor,
        )}
        title="Vault of Excellence"
      />
      <span className={cn("font-crest leading-none", textColor)}>
        <span className="block text-[0.66rem] font-semibold tracking-[0.22em]">
          VAULT <span className={ofColor}>OF</span>
        </span>
        <span className="mt-1 block text-[1.05rem] font-bold tracking-[0.14em]">EXCELLENCE</span>
      </span>
    </span>
  );
}
