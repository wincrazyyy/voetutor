import type { ListColumn } from "@/lib/types/profile-doc";

/**
 * Titled pill columns (courses / schools / skills) rendered as a quiet keyword index — outline
 * chips, not filled badges. Column count is derived from the number of lists (capped at 3) so the
 * grid never strands a lone trailing column; one list becomes a full-width chip cloud. The count
 * line only renders if a label is set.
 */

/**
 * Local grid map rather than the shared gridClass: pills need real text width, and the shared
 * 3-column step at lg leaves only ~189px inside a max-w-3xl body, wrapping most chips onto 2-3
 * lines. Holding 2 columns until xl keeps them on one line. photos.tsx still uses gridClass.
 */
const LIST_GRID: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
};

export function ListsBlock({ lists }: { lists: ListColumn[] }) {
  const cols = Math.min(Math.max(lists.length, 1), 3) as 1 | 2 | 3;
  return (
    <div className={`grid gap-x-8 gap-y-6 ${LIST_GRID[cols]}`}>
      {lists.map((col) => (
        <div key={col.id} className="space-y-2.5">
          {col.title ? (
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {col.title}
            </h3>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {col.items.map((item, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-transparent px-2.5 py-0.5 text-sm text-foreground/80"
              >
                {item}
              </span>
            ))}
          </div>
          {col.countLabel ? (
            <div className="text-xs text-muted-foreground">
              {col.items.length} {col.countLabel}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
