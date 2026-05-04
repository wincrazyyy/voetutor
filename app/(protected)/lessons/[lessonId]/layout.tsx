import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { getClassById } from "@/lib/queries/classes";
import { getClassIdForVideo, getVideoById } from "@/lib/queries/curriculum";
import { createClient } from "@/lib/supabase/server";

async function getLessonContext(lessonId: string) {
  const video = await getVideoById(lessonId);
  if (!video) return null;
  const classId = await getClassIdForVideo(lessonId);
  if (!classId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("subtopics")
    .select("title, topics(title)")
    .eq("id", video.subtopic_id)
    .maybeSingle();

  const cls = await getClassById(classId);
  const subtopicRow = data as unknown as { title: string; topics: { title: string } } | null;

  return {
    classId,
    classCode: cls?.code ?? null,
    topicTitle: subtopicRow?.topics?.title ?? null,
    subtopicTitle: subtopicRow?.title ?? null,
  };
}

export default async function LessonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const ctx = await getLessonContext(lessonId);

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="h-16 border-b flex items-center justify-between px-4 md:px-6 shrink-0 bg-card z-50">
        <div className="flex items-center gap-4 overflow-hidden">
          <Link href={ctx?.classId ? `/classes/${ctx.classId}` : "/dashboard"} className="shrink-0">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Curriculum</span>
            </Button>
          </Link>
          {ctx && (
            <>
              <div className="h-4 w-px bg-border hidden md:block shrink-0"></div>
              <div className="flex flex-col min-w-0">
                {ctx.topicTitle && (
                  <span className="text-[10px] uppercase tracking-widest font-bold text-primary leading-none mb-1 truncate">
                    {ctx.topicTitle}
                  </span>
                )}
                {ctx.subtopicTitle && <h1 className="text-sm font-bold truncate">{ctx.subtopicTitle}</h1>}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {ctx?.classCode && (
            <Badge variant="outline" className="hidden sm:flex border-primary/20 text-primary bg-primary/5">
              {ctx.classCode}
            </Badge>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
