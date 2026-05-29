"use client";

import { useMemo, useState } from "react";
import { Store } from "lucide-react";

import { Card } from "@/components/ui/card";
import { MarketplaceCard } from "@/components/classes/marketplace-card";
import { ClassSearchBar, type ClassSearchField } from "@/components/classes/class-search-bar";
import { getDisplayName } from "@/lib/utils/format";
import type { MarketplaceClass } from "@/lib/queries/marketplace";

interface MarketplaceListProps {
  classes: MarketplaceClass[];
}

export function MarketplaceList({ classes }: MarketplaceListProps) {
  const [query, setQuery] = useState("");
  const [field, setField] = useState<ClassSearchField>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return classes;

    return classes.filter((c) => {
      const educatorName = c.educator
        ? getDisplayName(c.educator.first_name, c.educator.last_name, c.educator.display_name).toLowerCase()
        : "";
      const title = c.title.toLowerCase();
      const code = c.code.toLowerCase();

      if (field === "educator") return educatorName.includes(q);
      if (field === "title") return title.includes(q);
      if (field === "code") return code.includes(q);
      return educatorName.includes(q) || title.includes(q) || code.includes(q);
    });
  }, [classes, query, field]);

  return (
    <div className="space-y-5">
      <ClassSearchBar
        query={query}
        onQueryChange={setQuery}
        field={field}
        onFieldChange={setField}
        totalCount={classes.length}
        filteredCount={filtered.length}
      />

      {filtered.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
          <Store className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold mb-1">No matches</h3>
          <p className="text-sm text-muted-foreground">
            Try a different search term or field.
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cls) => (
            <MarketplaceCard key={cls.id} cls={cls} />
          ))}
        </div>
      )}
    </div>
  );
}
