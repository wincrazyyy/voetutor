import Link from "next/link";
import { PlayCircle, ArrowRight, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { EnrolledClassSummary } from "@/lib/queries/classes";

interface EnrolledClassesListProps {
  classes: EnrolledClassSummary[];
}

export function EnrolledClassesList({ classes }: EnrolledClassesListProps) {
  return (
    <div className="space-y-6 lg:sticky lg:top-24 lg:col-span-4">
      <h2 className="text-2xl font-bold mb-2">My Classes</h2>

      {classes.length === 0 ? (
        <Card className="p-6 border border-dashed border-border bg-card/50 text-center">
          <GraduationCap className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            You are not enrolled in any classes yet. Your educator will add you to a class roster.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {classes.map((cls) => (
            <Card
              key={cls.id}
              className="flex flex-col overflow-hidden border border-border shadow-sm hover:shadow-md transition-shadow bg-card relative"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
              <div className="p-5 flex-1 mt-2">
                <div className="flex items-start justify-between mb-4 gap-4">
                  <h3 className="min-w-0 break-words text-lg font-bold leading-tight">{cls.title}</h3>
                  <Badge
                    variant="secondary"
                    className="text-xs sm:text-[10px] font-bold tracking-wider uppercase text-muted-foreground bg-muted shrink-0"
                  >
                    {cls.code}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-5">
                  <PlayCircle className="w-4 h-4" />
                  {cls.watched_videos} / {cls.total_videos} Videos Watched
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Progress</span>
                    <span className="text-primary">{cls.progress_percent}%</span>
                  </div>
                  <Progress value={cls.progress_percent} className="h-1.5" />
                </div>
              </div>

              <div className="p-3 bg-muted/20 border-t border-border">
                <Link href={`/class/${cls.id}`} className="w-full">
                  <Button
                    variant="ghost"
                    className="w-full justify-between group hover:bg-primary/5 hover:text-primary text-sm font-semibold h-10"
                  >
                    View Curriculum
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
