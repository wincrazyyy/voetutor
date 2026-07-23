import Link from "next/link";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBytes, formatShortDuration } from "@/lib/utils/format";
import type {
  EducatorLibrarySummary,
  EducatorReviewSummary,
  EducatorTeachingAggregates,
} from "@/lib/queries/educator-insights";

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5 border-border bg-card shadow-sm">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{label}</div>
      <div className="text-2xl font-black">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

interface EducatorHudStatsProps {
  teaching: EducatorTeachingAggregates;
  library: EducatorLibrarySummary;
  reviews: EducatorReviewSummary;
  educatorId: string;
}

/**
 * The three aggregate sections of the HUD: teaching-overview stat cells, the content-library
 * breakdown, and the reviews summary (with its own Manage-reviews button — the header's copy can be
 * a screen away on mobile).
 */
export function EducatorHudStats({ teaching, library, reviews, educatorId }: EducatorHudStatsProps) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-lg font-bold">Teaching overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <StatCell
            label="Classes"
            value={String(teaching.total_classes)}
            hint={`${teaching.published_classes} live · ${teaching.draft_classes} draft`}
          />
          <StatCell
            label="Enrolments"
            value={String(teaching.total_enrolments)}
            hint={`${teaching.unique_students} unique ${teaching.unique_students === 1 ? "student" : "students"}`}
          />
          <StatCell
            label="Curriculum"
            value={`${teaching.total_topics} ${teaching.total_topics === 1 ? "topic" : "topics"}`}
            hint={`${teaching.total_videos} ${teaching.total_videos === 1 ? "lesson" : "lessons"} placed`}
          />
          <StatCell
            label="Completions"
            value={String(teaching.total_completions)}
            hint={`${teaching.overall_completion_rate}% across the full curriculum`}
          />
          <StatCell
            label="Watch time"
            value={`${(teaching.total_watch_seconds / 3600).toFixed(1)} hrs`}
            hint="across all classes"
          />
          <StatCell
            label="Open Q&A"
            value={String(teaching.total_open_questions)}
            hint="unresolved forum threads"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Content library</h2>
        <Card className="border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Videos</div>
              <div className="mt-1 text-2xl font-black">{library.video_total}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{library.video_ready} ready</span>
                {library.video_in_progress > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    {library.video_in_progress} processing
                  </span>
                ) : null}
                {library.video_errored > 0 ? (
                  <span className="text-destructive">{library.video_errored} errored</span>
                ) : null}
                <span>
                  {library.video_placed} placed / {library.video_unplaced} unplaced
                </span>
                <span>
                  {formatShortDuration(`${Math.round(library.video_duration_seconds)} seconds`)}{" "}
                  total runtime
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</div>
              <div className="mt-1 text-2xl font-black">{library.note_total}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{formatBytes(library.note_total_bytes)} stored</span>
                <span>
                  {library.note_placed} placed / {library.note_unplaced} unplaced
                </span>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Reviews</h2>
        <Card className="border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {reviews.load_failed ? (
              <p className="text-sm text-muted-foreground">
                Reviews couldn&apos;t be loaded just now — refresh to retry. Managing them still
                works.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-1.5 text-lg font-black text-gold">
                  <Star className="h-4 w-4 fill-gold" aria-hidden />
                  {reviews.average_visible_rating ?? "—"}
                </span>
                <span className="text-muted-foreground">{reviews.total} total</span>
                <span className="text-muted-foreground">
                  {reviews.visible} visible / {reviews.hidden} hidden
                </span>
                <span className="text-muted-foreground">
                  {reviews.imported} imported / {reviews.verified} verified
                </span>
              </div>
            )}
            <Button variant="outline" size="sm" asChild className="shrink-0 self-start sm:self-auto">
              <Link href={`/admin/educators/${educatorId}/reviews`}>Manage reviews</Link>
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
