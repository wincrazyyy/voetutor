import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart3, BookOpen } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById } from "@/lib/queries/classes";
import { getEducatorClassStats, getStudentRosterProgress } from "@/lib/queries/educator";
import { getVideoAnalyticsForClass } from "@/lib/queries/video-analytics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StudentProgressList } from "@/components/educator/student-progress-list";

export default async function ClassStatisticsPage({
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
  if (profile.role === "educator" && cls.educator_id !== profile.id) redirect("/dashboard");

  const [stats, videoAnalytics, roster] = await Promise.all([
    getEducatorClassStats(classId),
    getVideoAnalyticsForClass(classId),
    getStudentRosterProgress(classId),
  ]);
  const watchHours = (stats.total_watch_seconds / 3600).toFixed(1);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-8">
      <div>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Link href="/statistics">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Statistics
            </Button>
          </Link>
          <Link href={`/class/${classId}`} className="ml-auto">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <BookOpen className="w-4 h-4" />
              Manage class
            </Button>
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
          <h1 className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
            <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
            <span className="min-w-0 break-words">Class Statistics</span>
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
            Minutes viewed is the total watch time across enrolled students; completions counts students who finished the lesson.
          </p>
        </div>
        {videoAnalytics.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No videos in this class yet.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-0 text-sm sm:min-w-[34rem]">
              <thead>
                <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 sm:px-5">Video</th>
                  <th className="px-3 py-3 text-right sm:px-5">Minutes Viewed</th>
                  <th className="px-3 py-3 text-right sm:px-5">Completions</th>
                </tr>
              </thead>
              <tbody>
                {videoAnalytics.map((video) => (
                  <tr key={video.videoId} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-3 font-medium sm:px-5">{video.title}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground sm:px-5">
                      {video.minutesViewed > 0 ? video.minutesViewed.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground sm:px-5">
                      {video.completions > 0 ? video.completions.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">Student Progress</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Expand a student to see their per-lesson completion, watch time, and resume position —
            or open their full profile for the deep view.
          </p>
        </div>
        <StudentProgressList students={roster.students} classId={classId} />
      </Card>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5 border-border bg-card shadow-sm">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{label}</div>
      <div className="mt-auto text-2xl font-black">{value}</div>
    </Card>
  );
}
