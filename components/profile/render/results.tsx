import type { ResultCard } from "@/lib/types/profile-doc";

/**
 * Exam results as an editorial stat band — big teal values carry the data, no bordered boxes. A
 * single result reads as one centered hero stat; multiples lay out as a flush-left grid. `value` is
 * free text (e.g. "Distinction"), so it is allowed to wrap.
 */
export function ResultsBlock({ cards }: { cards: ResultCard[] }) {
  if (cards.length === 1) {
    const c = cards[0];
    return (
      <div className="text-center">
        {c.title ? (
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {c.title}
          </div>
        ) : null}
        <div className="mt-1.5 text-4xl font-bold leading-none tracking-tight text-primary tabular-nums break-words sm:text-5xl">
          {c.value}
        </div>
        {c.helper ? <div className="mt-2 text-sm text-muted-foreground">{c.helper}</div> : null}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 sm:gap-x-6">
      {cards.map((c) => (
        <div key={c.id} className="text-center sm:text-left">
          {c.title ? (
            <div className="min-h-[2rem] text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground xl:min-h-0">
              {c.title}
            </div>
          ) : null}
          <div className="mt-1.5 text-2xl font-bold leading-none tracking-tight text-primary tabular-nums break-words sm:text-4xl">
            {c.value}
          </div>
          {c.helper ? <div className="mt-1.5 text-xs text-muted-foreground">{c.helper}</div> : null}
        </div>
      ))}
    </div>
  );
}
