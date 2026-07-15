import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById, getClassMemberCount } from "@/lib/queries/classes";
import { getCurriculumForClass } from "@/lib/queries/curriculum";
import { getForumPostsForClass, type ForumSort } from "@/lib/queries/forum";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ForumSearchableList } from "@/components/forum/forum-searchable-list";
import { ForumSidebar } from "@/components/forum/forum-sidebar";
import { ForumNewPostDialog } from "@/components/forum/forum-new-post-dialog";
import { ForumRealtime } from "@/components/forum/forum-realtime";

const SORTS: Array<{ key: ForumSort; label: string }> = [
  { key: "hot", label: "Hot" },
  { key: "new", label: "New" },
  { key: "top", label: "Top" },
  { key: "unanswered", label: "Unanswered" },
];

export default async function ClassForumPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { classId } = await params;
  const { sort: sortParam } = await searchParams;
  const sort: ForumSort = SORTS.some((s) => s.key === sortParam) ? (sortParam as ForumSort) : "hot";

  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const cls = await getClassById(classId);
  if (!cls) notFound();

  const viewerManagesClass = profile.role === "admin" || cls.educator_id === profile.id;

  const [posts, memberCount, curriculum] = await Promise.all([
    getForumPostsForClass(classId, profile.id, sort),
    getClassMemberCount(classId),
    getCurriculumForClass(classId, profile.id),
  ]);

  const videoMap = new Map<string, string>();
  for (const topic of curriculum) {
    for (const v of topic.videos) videoMap.set(v.id, v.title);
    for (const sub of topic.subtopics) for (const v of sub.videos) videoMap.set(v.id, v.title);
  }
  const videos = Array.from(videoMap, ([id, title]) => ({ id, title }));

  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-8">
      <ForumRealtime classId={classId} />
      <div>
        <Link href={`/class/${classId}`}>
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Curriculum
          </Button>
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2 sm:gap-3">
              <h1 className="flex min-w-0 items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
                <MessageSquare className="w-6 h-6 text-primary shrink-0 sm:w-7 sm:h-7" />
                <span className="min-w-0 break-words">Class Forum</span>
              </h1>
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
                {cls.code}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Discuss concepts, ask questions, and collaborate with your peers and educators.
            </p>
          </div>
          <ForumNewPostDialog classId={classId} videos={videos} uploaderId={profile.id} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        <div className="xl:col-span-8 space-y-4">
          <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto">
            {SORTS.map((s) => {
              const active = s.key === sort;
              return (
                <Link key={s.key} href={`/class/${classId}/forum?sort=${s.key}`} scroll={false} className="shrink-0">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-3 py-2.5 text-sm font-medium transition-colors sm:py-1.5",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                </Link>
              );
            })}
          </div>

          <ForumSearchableList
            posts={posts}
            classId={classId}
            classEducatorId={cls.educator_id}
            emptyHint={
              sort === "unanswered"
                ? "No unanswered questions — everything has a reply or is resolved."
                : "Be the first to start a thread for this class."
            }
          />
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:col-span-4">
          <ForumSidebar
            classCode={cls.code}
            memberCount={memberCount}
            postCount={posts.length}
            resolvedCount={posts.filter((p) => p.is_resolved).length}
            showMemberCount={viewerManagesClass}
          />
        </div>
      </div>
    </div>
  );
}
