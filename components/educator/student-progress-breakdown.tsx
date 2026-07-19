"use client";

import { CheckCircle2, CircleDashed, Clock, EyeOff, PlayCircle } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/utils/format";
import type { StudentClassProgress } from "@/lib/queries/student-insights";

function formatWatchTime(seconds: number): string {
  if (!seconds || seconds < 1) return "0m";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

/** Fixed locale + UTC so server and client render the same string (no hydration mismatch). */
const ABS_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatAbsDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : ABS_DATE.format(date);
}

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5 border-border bg-card shadow-sm">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{label}</div>
      <div className="mt-auto text-2xl font-black">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

/**
 * Panels B + C of the student insight page: the overview stat cells (completion vs class average,
 * counts, watch time, coverage, activity window) and the per-topic accordion with per-video rows.
 * Out-of-scope videos render greyed "No access" rows so the educator still sees the whole
 * curriculum shape (plan D8). All ratios arrive denominator-guarded from the query layer.
 */
export function StudentProgressBreakdown({
  progress,
  classAverage,
}: {
  progress: StudentClassProgress;
  classAverage: number;
}) {
  const coverage =
    progress.total_duration_seconds === 0
      ? null
      : `${formatWatchTime(progress.accessible_watch_seconds)} of ${formatWatchTime(progress.total_duration_seconds)} of content`;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCell
          label="Completion"
          value={`${progress.completion_percent}%`}
          hint={`Class average ${classAverage}%`}
        />
        <StatCell
          label="Lessons"
          value={`${progress.completed_count} / ${progress.accessible_total}`}
          hint={`${progress.started_count - progress.completed_count} in progress · ${Math.max(0, progress.accessible_total - progress.started_count)} not started`}
        />
        <StatCell
          label="Watch time"
          value={formatWatchTime(progress.total_watch_seconds)}
          hint={coverage ?? undefined}
        />
      </div>

      <Card className="border-border bg-card p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-foreground">Overall completion</span>
          <span className="tabular-nums text-muted-foreground">{progress.completion_percent}%</span>
        </div>
        <Progress value={progress.completion_percent} />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {progress.first_activity_at ? (
            <span>First activity {relativeTime(progress.first_activity_at)}</span>
          ) : (
            <span>No lesson activity yet</span>
          )}
          {progress.last_progress_at ? (
            <span>Last lesson activity {relativeTime(progress.last_progress_at)}</span>
          ) : null}
        </div>
      </Card>

      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">Curriculum Breakdown</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Expand a topic to see this student&apos;s per-lesson status, watch time, and resume position.
          </p>
        </div>
        {progress.topics.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No lessons in this class yet.</div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {progress.topics.map((topic) => {
              const topicPct =
                topic.accessible_total === 0
                  ? 0
                  : Math.round((topic.completed_count / topic.accessible_total) * 100);
              return (
                <AccordionItem key={topic.topic_id} value={topic.topic_id} className="border-border">
                  <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/30">
                    <div className="flex w-full items-center gap-3 pr-1 sm:gap-4 sm:pr-4">
                      <div className="flex min-w-0 flex-col items-start">
                        <span className="truncate text-sm font-bold text-foreground">{topic.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {topic.accessible_total === 0
                            ? "No accessible lessons"
                            : `${topic.completed_count} / ${topic.accessible_total} lessons completed · ${topicPct}%`}
                        </span>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-3">
                        <div className="hidden w-24 sm:block">
                          <Progress value={topicPct} className="h-1.5" />
                        </div>
                        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {formatWatchTime(topic.watch_seconds)}
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-0">
                    <div className="w-full overflow-x-auto">
                      <table className="w-full min-w-[40rem] text-sm">
                        <thead>
                          <tr className="border-y border-border bg-muted/20 text-left text-xs md:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <th className="px-5 py-2">Lesson</th>
                            <th className="px-5 py-2">Status</th>
                            <th className="px-5 py-2 text-right">Watch Time</th>
                            <th className="px-5 py-2 text-right">Last Position</th>
                            <th className="px-5 py-2 text-right">Last Watched</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topic.videos.map((video) => (
                            <tr
                              key={video.video_id}
                              className={cn(
                                "border-b border-border/50 last:border-0",
                                !video.accessible && "opacity-50",
                              )}
                            >
                              <td className="px-5 py-2.5 font-medium">{video.title}</td>
                              <td className="px-5 py-2.5">
                                {!video.accessible ? (
                                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                    <EyeOff className="h-3.5 w-3.5" /> No access
                                  </span>
                                ) : video.is_completed ? (
                                  <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                                    {video.completed_at ? (
                                      <span className="font-normal text-muted-foreground">
                                        {formatAbsDate(video.completed_at)}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : video.started ? (
                                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                                    <PlayCircle className="h-3.5 w-3.5" /> In progress
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                    <CircleDashed className="h-3.5 w-3.5" /> Not started
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                                {video.watch_seconds > 0 ? formatWatchTime(video.watch_seconds) : "—"}
                              </td>
                              <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                                {video.last_position_seconds > 0
                                  ? formatWatchTime(video.last_position_seconds)
                                  : "—"}
                              </td>
                              <td className="px-5 py-2.5 text-right whitespace-nowrap text-muted-foreground">
                                {video.last_watched_at ? relativeTime(video.last_watched_at) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </Card>
    </div>
  );
}
