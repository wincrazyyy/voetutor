import type { ServiceItem } from "@/lib/types/profile-doc";

/** Display-only services & pricing as a ruled price-menu. Promo struck "was" price; drops empty names. */
export function ServicesBlock({ items }: { items: ServiceItem[] }) {
  const safe = items.filter((s) => s.name?.trim());
  if (!safe.length) return null;
  return (
    <div className="divide-y divide-border">
      {safe.map((s) => (
        <div key={s.id} className="flex items-baseline justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="font-medium text-foreground">{s.name}</div>
            {s.description ? (
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
            ) : null}
          </div>
          {s.priceLabel ? (
            <div className="shrink-0 text-right font-bold text-primary">
              {s.wasPriceLabel ? (
                <span className="mr-1 font-normal text-muted-foreground line-through">{s.wasPriceLabel}</span>
              ) : null}
              {s.priceLabel}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
