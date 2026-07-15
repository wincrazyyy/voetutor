import Link from "next/link";
import { Play, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatShortDuration } from "@/lib/utils/format";

interface UpNextHeroVideo {
  id: string;
  title: string;
  subtopic_title: string | null;
  duration: string | null;
}

interface UpNextHeroProps {
  video: UpNextHeroVideo | null;
  classId: string;
}

export function UpNextHero({ video, classId }: UpNextHeroProps) {
  if (!video) {
    return (
      <Card className="w-full relative overflow-hidden border-2 border-dashed border-border bg-card/50">
        <div className="p-4 sm:p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-500 mb-1 uppercase tracking-wider">All Caught Up</div>
              <h2 className="text-2xl font-bold mb-2">No active lessons remaining</h2>
              <p className="text-muted-foreground">You have completed every available lesson in this class.</p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full relative overflow-hidden border-2 border-primary/20 bg-card shadow-lg">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-primary"></div>
      <div className="p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Play className="w-6 h-6 sm:w-8 sm:h-8 text-primary ml-1" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-primary mb-1 uppercase tracking-wider">Up Next</div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2 break-words">{video.title}</h2>
            <p className="text-muted-foreground break-words">
              {video.subtopic_title ? `${video.subtopic_title} • ` : ""}
              {formatShortDuration(video.duration)}
            </p>
          </div>
        </div>
        <Link href={`/lesson/${video.id}?from=${classId}`} className="w-full md:w-auto shrink-0">
          <Button size="lg" className="w-full rounded-full h-12 px-8 shadow-md">
            Resume Lesson
          </Button>
        </Link>
      </div>
    </Card>
  );
}
