"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flag, Globe, Library, Lock, Settings } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteClassButton } from "@/components/classes/delete-class-button";
import { ClassSearchBar, type ClassSearchField } from "@/components/classes/class-search-bar";
import { formatPrice, getDisplayName, relativeTime } from "@/lib/utils/format";
import type { AdminClassRow } from "@/lib/queries/admin-classes";

interface AdminClassesListProps {
  classes: AdminClassRow[];
}

export function AdminClassesList({ classes }: AdminClassesListProps) {
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
    <div className="space-y-4">
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
          <Library className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold mb-1">No matches</h3>
          <p className="text-sm text-muted-foreground">
            {query.trim() ? "Try a different search term or field." : "As educators create classes they will appear here."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => {
            const educatorName = c.educator
              ? getDisplayName(c.educator.first_name, c.educator.last_name, c.educator.display_name)
              : "Unassigned";
            return (
              <Card key={c.id} className="p-5 border-border shadow-sm bg-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h2 className="text-lg font-bold truncate">
                        <Link
                          href={`/class/${c.id}`}
                          className="rounded-sm outline-none transition-colors hover:text-primary hover:underline underline-offset-4"
                        >
                          {c.title}
                        </Link>
                      </h2>
                      <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
                        {c.code}
                      </Badge>
                      {c.is_published ? (
                        <Badge variant="secondary" className="bg-primary/10 text-primary gap-1">
                          <Globe className="w-3 h-3" />
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-muted-foreground gap-1">
                          <Lock className="w-3 h-3" />
                          Draft
                        </Badge>
                      )}
                      {c.pending_report_count > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <Flag className="w-3 h-3" />
                          {c.pending_report_count} {c.pending_report_count === 1 ? "report" : "reports"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Taught by <span className="font-semibold text-foreground">{educatorName}</span> · created {relativeTime(c.created_at)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-start gap-3 sm:justify-end">
                    <Link
                      href={`/class/${c.id}/edit`}
                      className="relative inline-flex w-fit items-center gap-1 text-sm text-muted-foreground after:absolute after:-inset-3 after:content-[''] hover:text-foreground sm:text-xs"
                    >
                      <Settings className="w-3 h-3" />
                      Settings
                    </Link>
                    <DeleteClassButton
                      classId={c.id}
                      classCode={c.code}
                      classTitle={c.title}
                      variant="ghost"
                      size="sm"
                      label="Delete"
                    />
                  </div>
                </div>

                <div className="mt-0 grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground sm:mt-4 sm:grid-cols-3">
                  <div className="col-span-2 min-w-0 bg-muted/30 rounded-md p-2 text-center sm:col-span-1">
                    <div className="text-foreground font-bold text-base">{formatPrice(c.price_cents, c.currency)}</div>
                    <div>Price</div>
                  </div>
                  <div className="min-w-0 bg-muted/30 rounded-md p-2 text-center">
                    <div className="text-foreground font-bold text-base">{c.student_count}</div>
                    <div>Enrolled</div>
                  </div>
                  <div className="min-w-0 bg-muted/30 rounded-md p-2 text-center">
                    <div className="text-foreground font-bold text-base">{c.pending_report_count}</div>
                    <div>Open reports</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
