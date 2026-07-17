"use client";

import { CheckCircle2, CircleDashed, PlayCircle, Clock } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { StudentRosterEntry, StudentVideoProgress } from "@/lib/queries/educator";

type StudentEntry = StudentRosterEntry & { videos: StudentVideoProgress[] };

function formatWatchTime(seconds: number): string {
  if (!seconds || seconds < 1) return "0m";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function StudentProgressList({ students }: { students: StudentEntry[] }) {
  if (students.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">No students enrolled yet.</div>
    );
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      {students.map((student) => {
        const completionPct =
          student.total_videos === 0 ? 0 : Math.round((student.completed_count / student.total_videos) * 100);
        return (
          <AccordionItem key={student.user_id} value={student.user_id} className="border-border">
            <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/30">
              <div className="flex items-center gap-3 w-full pr-1 sm:gap-4 sm:pr-4">
                <UserAvatar avatarUrl={null} firstName={null} lastName={null} displayName={student.name} size="sm" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-sm font-bold text-foreground truncate">{student.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {student.completed_count} / {student.total_videos}{" "}
                    <span className="whitespace-nowrap">lessons completed · {completionPct}%</span>
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground font-medium shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  {formatWatchTime(student.total_watch_seconds)}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="p-0">
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-y border-border bg-muted/20 text-left text-xs md:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-2">Lesson</th>
                    <th className="px-5 py-2">Status</th>
                    <th className="px-5 py-2 text-right">Watch Time</th>
                    <th className="px-5 py-2 text-right">Last Position</th>
                  </tr>
                </thead>
                <tbody>
                  {student.videos.map((video) => (
                    <tr key={video.video_id} className="border-b border-border/50 last:border-0">
                      <td className="px-5 py-2.5 font-medium">{video.title}</td>
                      <td className="px-5 py-2.5">
                        {video.is_completed ? (
                          <span className="inline-flex items-center gap-1.5 text-primary font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                          </span>
                        ) : video.started ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                            <PlayCircle className="w-3.5 h-3.5" /> In progress
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <CircleDashed className="w-3.5 h-3.5" /> Not started
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                        {video.watch_seconds > 0 ? formatWatchTime(video.watch_seconds) : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                        {video.last_position_seconds > 0 ? formatWatchTime(video.last_position_seconds) : "—"}
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
  );
}
