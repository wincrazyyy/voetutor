import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById } from "@/lib/queries/classes";
import { getEducatorClassStats } from "@/lib/queries/educator";
import { getVideoAnalyticsForClass } from "@/lib/queries/video-analytics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function EducatorClassStatsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role === "educator" && !profile.is_approved) redirect("/pending");
  if (profile.role !== "educator" && profile.role !== "admin") redirect("/dashboard");

  const cls = await getClassById(classId);
  if (!cls) notFound();
  if (profile.role === "educator" && cls.educator_id !== profile.id) {
    redirect("/educator");
  }

  const [stats, videoAnalytics] = await Promise.all([
    getEducatorClassStats(classId),
    getVideoAnalyticsForClass(classId),
  ]);
  const watchHours = (stats.total_watch_seconds / 3600).toFixed(1);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <Link href={`/educator/classes/${classId}`}>
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Class
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-primary" />
            Class Statistics
          </h1>
          <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
            {cls.code}
          </Badge>
        </div>
        <p className="text-muted-foreground">Engagement and progress metrics across {cls.title}.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCell label="Enrolled Students" value={`${stats.total_students}`} />
        <StatCell label="Lessons Available" value={`${stats.total_videos}`} />
        <StatCell label="Total Completions" value={`${stats.total_completions}`} />
        <StatCell label="Average Completion Rate" value={`${stats.average_completion_rate}%`} />
        <StatCell label="Total Watch Time" value={`${watchHours} hrs`} />
        <StatCell label="Open Forum Threads" value={`${stats.unanswered_posts}`} />
      </div>

      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">Per-Video Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Minutes viewed is reported by Cloudflare Stream over the last 90 days; completions are tracked across enrolled students.
          </p>
        </div>
        {videoAnalytics.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No videos in this class yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3">Video</th>
                <th className="px-5 py-3 text-right">Minutes Viewed</th>
                <th className="px-5 py-3 text-right">Completions</th>
              </tr>
            </thead>
            <tbody>
              {videoAnalytics.map((video) => (
                <tr key={video.videoId} className="border-b border-border/50 last:border-0">
                  <td className="px-5 py-3 font-medium">{video.title}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                    {video.minutesViewed > 0 ? video.minutesViewed.toLocaleString() : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                    {video.completions > 0 ? video.completions.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5 border-border bg-card shadow-sm">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{label}</div>
      <div className="text-2xl font-black">{value}</div>
    </Card>
  );
}
