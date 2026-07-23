import Link from "next/link";
import { BarChart3, BookOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPrice, relativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { EducatorClassWithStats } from "@/lib/queries/educator-insights";

interface EducatorClassBreakdownProps {
  classes: EducatorClassWithStats[];
}

/**
 * Per-class rows with live engagement figures. Each row links out to the class statistics page and
 * the class manage view; the row itself is NOT a link (it contains two links — nesting is
 * forbidden), and both buttons are always visible (no hover-reveal on touch).
 */
export function EducatorClassBreakdown({ classes }: EducatorClassBreakdownProps) {
  return (
    <Card className="border-border bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-bold">Classes</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every class this educator owns, with live engagement numbers. Open the stats page for
          per-student detail.
        </p>
      </div>

      {classes.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No classes yet.</div>
      ) : (
        <div className="divide-y divide-border/50">
          {classes.map((cls) => (
            <div key={cls.id} className="space-y-2 p-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-words text-sm font-semibold">{cls.title}</span>
                <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
                  {cls.code}
                </Badge>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    cls.is_published
                      ? "bg-primary/10 text-primary"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                  )}
                >
                  {cls.is_published ? "Live" : "Draft"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatPrice(cls.price_cents, cls.currency)}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{cls.student_count} enrolled</span>
                <span>{cls.topic_count} topics</span>
                <span>{cls.video_count} lessons</span>
                <span>{cls.stats.average_completion_rate}% completion</span>
                <span>{(cls.stats.total_watch_seconds / 3600).toFixed(1)}h watched</span>
                <span
                  className={cn(
                    cls.unanswered_post_count > 0 && "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {cls.unanswered_post_count} open Q&amp;A
                </span>
                <span>created {relativeTime(cls.created_at)}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/statistics/${cls.id}`}>
                    <BarChart3 className="h-4 w-4" />
                    Statistics
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/class/${cls.id}`}>
                    <BookOpen className="h-4 w-4" />
                    Manage class
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
