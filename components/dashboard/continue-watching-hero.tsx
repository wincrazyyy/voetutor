import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DashboardLesson } from "@/lib/queries/progress";
import { formatShortDuration } from "@/lib/utils/format";

interface ContinueWatchingHeroProps {
  lesson: DashboardLesson | null;
}

export function ContinueWatchingHero({ lesson }: ContinueWatchingHeroProps) {
  if (!lesson) {
    return (
      <Card className="w-full relative overflow-hidden border-2 border-dashed border-border bg-card/50">
        <div className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <div className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">No active lesson</div>
              <h2 className="text-xl font-bold mb-1">Pick a class to begin learning</h2>
              <p className="text-sm text-muted-foreground">Once you start a video, your last position will appear here.</p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const isResume = lesson.mode === "resume";
  const eyebrow = isResume ? "Continue Watching" : "Up Next";
  const cta = isResume ? "Resume Lesson" : "Start Lesson";
  const remainingMinutes = Math.max(1, Math.round(lesson.remaining_seconds / 60));
  const trailing = isResume && lesson.remaining_seconds > 0
    ? `${remainingMinutes} min remaining`
    : formatShortDuration(lesson.duration);

  return (
    <Card className="w-full relative overflow-hidden border-2 border-primary/20 bg-card shadow-md">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-primary"></div>
      <div className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-5">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Play className="w-6 h-6 text-primary ml-1" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-primary mb-1 uppercase tracking-wider">{eyebrow}</div>
            <h2 className="text-xl font-bold mb-1 break-words">{lesson.video_title}</h2>
            <p className="text-sm text-muted-foreground break-words">
              {lesson.context_title} • {lesson.class_code} • {trailing}
            </p>
          </div>
        </div>
        <Link href={`/lesson/${lesson.video_id}?from=${lesson.class_id}`} className="w-full md:w-auto shrink-0">
          <Button className="w-full rounded-full shadow-md">{cta}</Button>
        </Link>
      </div>
    </Card>
  );
}
