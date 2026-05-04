import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Plus } from "lucide-react";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassById, getClassMemberCount } from "@/lib/queries/classes";
import { getForumPostsForClass } from "@/lib/queries/forum";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ForumPostList } from "@/components/forum/forum-post-list";
import { ForumSidebar } from "@/components/forum/forum-sidebar";

export default async function ClassForumPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const cls = await getClassById(classId);
  if (!cls) notFound();

  const [posts, memberCount] = await Promise.all([
    getForumPostsForClass(classId),
    getClassMemberCount(classId),
  ]);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-8 bg-background">
      <div>
        <Link href={`/classes/${classId}`}>
          <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Curriculum
          </Button>
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                <MessageSquare className="w-7 h-7 text-primary" />
                Class Forum
              </h1>
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 uppercase tracking-wider font-bold">
                {cls.code}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Discuss concepts, ask questions, and collaborate with your peers and educators.
            </p>
          </div>
          <Button className="gap-2 shadow-md" disabled>
            <Plus className="w-4 h-4" />
            New Post
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        <div className="xl:col-span-8 space-y-6">
          <ForumPostList posts={posts} />
        </div>

        <div className="xl:col-span-4 space-y-6 sticky top-24">
          <ForumSidebar
            classCode={cls.code}
            memberCount={memberCount}
            postCount={posts.length}
            resolvedCount={posts.filter((p) => p.is_resolved).length}
          />
        </div>
      </div>
    </div>
  );
}
