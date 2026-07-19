import Link from "next/link";
import { Megaphone, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { relativeTime } from "@/lib/utils/format";
import type { StudentClassEngagement } from "@/lib/queries/student-insights";

function EngagementStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-xs md:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-black text-foreground">{value}</div>
    </div>
  );
}

/**
 * Panel D of the student insight page: the student's forum footprint in this class plus their
 * announcement read ratio (n = the announcements THIS student can see — broadcasts plus rows
 * targeted at passes they hold). The ratio denominator is guarded upstream; 0-of-0 renders as
 * a quiet empty state, never NaN.
 */
export function StudentEngagementPanel({
  engagement,
  classId,
}: {
  engagement: StudentClassEngagement;
  classId: string;
}) {
  const readPct =
    engagement.announcements_visible === 0
      ? 0
      : Math.round((engagement.announcements_read / engagement.announcements_visible) * 100);

  return (
    <Card className="border-border bg-card shadow-sm overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="text-lg font-bold">Community Engagement</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Forum participation and announcement reads in this class.
        </p>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquare className="h-4 w-4 text-primary" />
            Forum
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <EngagementStat
              label="Threads started"
              value={`${engagement.posts_count}${engagement.qa_posts_count > 0 ? ` (${engagement.qa_posts_count} Q&A)` : ""}`}
            />
            <EngagementStat label="Replies written" value={`${engagement.replies_count}`} />
            <EngagementStat label="Upvotes received" value={`${engagement.upvotes_received}`} />
            <EngagementStat label="Questions resolved" value={`${engagement.resolved_questions}`} />
            <EngagementStat
              label="Last forum activity"
              value={
                engagement.last_forum_activity_at
                  ? relativeTime(engagement.last_forum_activity_at)
                  : "—"
              }
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Megaphone className="h-4 w-4 text-primary" />
            Announcements
          </div>
          {engagement.announcements_visible === 0 ? (
            <p className="text-sm text-muted-foreground">No announcements in this class yet.</p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  Read {engagement.announcements_read} of {engagement.announcements_visible}
                </span>
                <span className="tabular-nums text-muted-foreground">{readPct}%</span>
              </div>
              <Progress value={readPct} />
              {engagement.last_announcement_read_at ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Last read {relativeTime(engagement.last_announcement_read_at)}
                </p>
              ) : null}
            </>
          )}
        </div>

        <Link href={`/class/${classId}/forum`} className="inline-block">
          <Button variant="outline" size="sm" className="gap-2">
            <MessageSquare className="h-3.5 w-3.5" />
            Open class forum
          </Button>
        </Link>
      </div>
    </Card>
  );
}
