import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ClipboardList,
  Megaphone,
  MessageSquare,
  PlayCircle,
  Settings,
  Users,
} from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById } from "@/lib/queries/classes";
import { getCurriculumForClass } from "@/lib/queries/curriculum";
import { getEducatorClassStats } from "@/lib/queries/educator";
import { getVideoLibrary } from "@/lib/queries/video-library";
import { getAnnouncementsForClass } from "@/lib/queries/announcements";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EducatorCurriculumOverview } from "@/components/educator/educator-curriculum-overview";

export default async function EducatorClassPage({
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

  const [curriculum, stats, announcements, libraryVideos] = await Promise.all([
    getCurriculumForClass(classId, profile.id),
    getEducatorClassStats(classId),
    getAnnouncementsForClass(classId, 5),
    getVideoLibrary(profile.id),
  ]);

  const totalWatchHours = (stats.total_watch_seconds / 3600).toFixed(1);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-8">
      <div>
        <Link href="/educator">
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Educator Hub
          </Button>
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                <ClipboardList className="w-7 h-7 text-primary" />
                {cls.title}
              </h1>
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
                {cls.code}
              </Badge>
            </div>
            <p className="text-muted-foreground">Manage curriculum, post announcements, and track engagement.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/educator/classes/${classId}/edit`}>
              <Button variant="outline" className="gap-2">
                <Settings className="w-4 h-4" />
                Class Settings
              </Button>
            </Link>
            <Link href={`/educator/classes/${classId}/announcements/new`}>
              <Button className="gap-2 shadow-md">
                <Megaphone className="w-4 h-4" />
                Post Announcement
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5 border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Students</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black">{stats.total_students}</div>
        </Card>
        <Card className="p-5 border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Avg Completion</span>
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black">{stats.average_completion_rate}%</div>
        </Card>
        <Card className="p-5 border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Watch</span>
            <PlayCircle className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black">
            {totalWatchHours}
            <span className="text-sm text-muted-foreground font-medium"> hrs</span>
          </div>
        </Card>
        <Card className="p-5 border-border bg-card shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Open Q&A</span>
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black">{stats.unanswered_posts}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        <div className="xl:col-span-8 space-y-6">
          <EducatorCurriculumOverview
            classId={classId}
            curriculum={curriculum}
            libraryVideos={libraryVideos}
          />
        </div>

        <div className="xl:col-span-4 space-y-6 sticky top-24">
          <Card className="p-5 border-border shadow-sm bg-card">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              Recent Announcements
            </h2>
            {announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No announcements yet for this class.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {announcements.map((ann) => (
                  <li key={ann.id} className="text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <div className="font-semibold leading-tight">{ann.title}</div>
                    <div className="text-xs text-muted-foreground capitalize mt-0.5">{ann.type}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5 border-border shadow-sm bg-card">
            <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Class Forum
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              {stats.unanswered_posts} unresolved {stats.unanswered_posts === 1 ? "thread" : "threads"} need attention.
            </p>
            <Link href={`/classes/${classId}/forum`} className="w-full">
              <Button variant="outline" className="w-full justify-between group">
                Open Forum
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </Card>

          <Card className="p-5 border-border shadow-sm bg-card">
            <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Detailed Statistics
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              Drill into completions, watch time, and forum activity.
            </p>
            <Link href={`/educator/classes/${classId}/stats`} className="w-full">
              <Button variant="outline" className="w-full justify-between group">
                View Stats
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
