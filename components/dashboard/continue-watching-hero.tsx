import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ContinueWatchingItem } from "@/lib/queries/progress";
import { formatShortDuration } from "@/lib/utils/format";

interface ContinueWatchingHeroProps {
  item: ContinueWatchingItem | null;
}

export function ContinueWatchingHero({ item }: ContinueWatchingHeroProps) {
  if (!item) {
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

  const remainingMinutes = Math.max(1, Math.round(item.remaining_seconds / 60));
  const remainingLabel = item.remaining_seconds === 0
    ? formatShortDuration(item.duration)
    : `${remainingMinutes} min remaining`;

  return (
    <Card className="w-full relative overflow-hidden border-2 border-primary/20 bg-card shadow-md">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-primary"></div>
      <div className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Play className="w-6 h-6 text-primary ml-1" />
          </div>
          <div>
            <div className="text-xs font-bold text-primary mb-1 uppercase tracking-wider">Continue Watching</div>
            <h2 className="text-xl font-bold mb-1">{item.video_title}</h2>
            <p className="text-sm text-muted-foreground">
              {item.subtopic_title} • {item.class_code} • {remainingLabel}
            </p>
          </div>
        </div>
        <Link href={`/lesson/${item.video_id}?from=${item.class_id}`} className="w-full md:w-auto shrink-0">
          <Button className="w-full rounded-full shadow-md">Resume Lesson</Button>
        </Link>
      </div>
    </Card>
  );
}
