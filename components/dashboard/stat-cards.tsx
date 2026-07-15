import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayCircle, BookOpen, Clock } from "lucide-react";
import type { DashboardStats } from "@/lib/queries/progress";

interface StatCardsProps {
  stats: DashboardStats;
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 0.05) return "0";
  return hours.toFixed(1);
}

function formatDelta(seconds: number): string {
  if (seconds === 0) return "No change from last week";
  const sign = seconds > 0 ? "+" : "−";
  const abs = Math.abs(seconds);
  const hours = abs / 3600;
  const value = hours < 0.05 ? `${Math.round(abs / 60)} min` : `${hours.toFixed(1)} hrs`;
  return `${sign}${value} from last week`;
}

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="shadow-sm border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Videos Watched
          </CardTitle>
          <PlayCircle className="w-5 h-5 text-primary shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-black text-foreground">
            {stats.videos_watched}
            {stats.videos_total > 0 && (
              <span className="text-lg text-muted-foreground font-medium"> / {stats.videos_total}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.videos_total === 0 ? "No videos available yet" : "Across all enrolled classes"}
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Question Bank
          </CardTitle>
          <BookOpen className="w-5 h-5 text-primary shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-black text-foreground">—</div>
          <p className="text-sm text-muted-foreground mt-1">Coming soon</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Study Time (This Week)
          </CardTitle>
          <Clock className="w-5 h-5 text-primary shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-black text-foreground">
            {formatHours(stats.weekly_watch_seconds)}
            <span className="text-lg text-muted-foreground font-medium"> hrs</span>
          </div>
          <p className={`text-sm font-medium mt-1 ${stats.weekly_delta_seconds >= 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
            {formatDelta(stats.weekly_delta_seconds)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
