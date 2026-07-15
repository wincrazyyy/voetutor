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

import { getCurriculumForClass } from "@/lib/queries/curriculum";
import { getEducatorClassStats } from "@/lib/queries/educator";
import { getVideoLibrary } from "@/lib/queries/video-library";
import { getNoteLibrary } from "@/lib/queries/note-library";
import { getAnnouncementsForClass } from "@/lib/queries/announcements";
import { AnnouncementsPanel } from "@/components/announcements/announcements-panel";
import { TableRefresh } from "@/components/realtime/table-refresh";
import type { Class } from "@/lib/types/database";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EducatorCurriculumOverview } from "@/components/educator/educator-curriculum-overview";

/** The educator/admin management view of a class. Rendered by /class/[id] for the owner/admin. */
export async function EducatorClassManage({ cls, userId }: { cls: Class; userId: string }) {
  const classId = cls.id;

  const [curriculum, stats, announcements, libraryVideos, libraryNotes] = await Promise.all([
    getCurriculumForClass(classId, userId),
    getEducatorClassStats(classId),
    getAnnouncementsForClass(classId, 5),
    getVideoLibrary(userId),
    getNoteLibrary(userId),
  ]);

  const totalWatchHours = (stats.total_watch_seconds / 3600).toFixed(1);

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-8">
      <TableRefresh
        channel={`announcements:educatorclass:${classId}`}
        subscriptions={[{ table: "announcements", filter: `class_id=eq.${classId}` }]}
      />
      <div>
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
              <h1 className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
                <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
                <span className="min-w-0 break-words">{cls.title}</span>
              </h1>
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
                {cls.code}
              </Badge>
            </div>
            <p className="text-muted-foreground">Manage curriculum, post announcements, and track engagement.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link href={`/class/${classId}/students`} className="w-full sm:w-auto">
              <Button variant="outline" className="w-full gap-2 sm:w-auto">
                <Users className="w-4 h-4" />
                Manage Students
              </Button>
            </Link>
            <Link href={`/class/${classId}/edit`} className="w-full sm:w-auto">
              <Button variant="outline" className="w-full gap-2 sm:w-auto">
                <Settings className="w-4 h-4" />
                Class Settings
              </Button>
            </Link>
            <Link href={`/class/${classId}/announce`} className="w-full sm:w-auto">
              <Button className="w-full gap-2 shadow-md sm:w-auto">
                <Megaphone className="w-4 h-4" />
                Post Announcement
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Link href={`/class/${classId}/students`}>
          <Card className="p-5 border-border bg-card shadow-sm transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Students</span>
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-black">{stats.total_students}</div>
          </Card>
        </Link>
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
            libraryNotes={libraryNotes}
          />
        </div>

        <div className="space-y-6 xl:col-span-4 xl:sticky xl:top-24">
          <AnnouncementsPanel
            classId={classId}
            latest={announcements[0] ?? null}
            hasUnread={announcements.some((a) => !a.has_read)}
          />

          <Card className="p-5 border-border shadow-sm bg-card">
            <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Class Forum
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              {stats.unanswered_posts} unresolved {stats.unanswered_posts === 1 ? "thread" : "threads"} need attention.
            </p>
            <Link href={`/class/${classId}/forum`} className="w-full">
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
            <Link href={`/class/${classId}/stats`} className="w-full">
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
