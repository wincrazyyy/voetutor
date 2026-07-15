import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { createClient } from "@/lib/supabase/server";

async function getLessonContext(lessonId: string) {
  const supabase = await createClient();
  /* One query resolves the breadcrumb from the video's placement. RLS filters
     to placements the viewer can see, so limit(1) lands on a class they belong
     to (the single placement in the common case). */
  const { data } = await supabase
    .from("video_placements")
    .select(
      "topic_id, subtopic_id, topics(title, class_id, classes(code)), subtopics(title, topics(title, class_id, classes(code)))",
    )
    .eq("video_id", lessonId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as {
    topics: { title: string; class_id: string; classes: { code: string } } | null;
    subtopics: { title: string; topics: { title: string; class_id: string; classes: { code: string } } } | null;
  };

  if (row.subtopics) {
    return {
      classId: row.subtopics.topics.class_id,
      classCode: row.subtopics.topics.classes.code,
      topicTitle: row.subtopics.topics.title,
      subtopicTitle: row.subtopics.title,
    };
  }
  if (row.topics) {
    return {
      classId: row.topics.class_id,
      classCode: row.topics.classes.code,
      topicTitle: row.topics.title,
      subtopicTitle: null as string | null,
    };
  }
  return null;
}

async function LessonHeaderContent({ lessonId }: { lessonId: string }) {
  const ctx = await getLessonContext(lessonId);

  return (
    <>
      <div className="flex items-center gap-4 overflow-hidden">
        <Link href={ctx?.classId ? `/class/${ctx.classId}` : "/dashboard"} className="shrink-0">
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
                <span className="text-xs sm:text-[10px] uppercase tracking-widest font-bold text-primary leading-none mb-1 truncate">
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
    </>
  );
}

function LessonHeaderFallback() {
  return (
    <div className="flex items-center gap-4 overflow-hidden">
      <Link href="/dashboard" className="shrink-0">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to Curriculum</span>
        </Button>
      </Link>
      <div className="h-4 w-px bg-border hidden md:block shrink-0"></div>
      <div className="flex flex-col min-w-0 gap-1.5">
        <div className="h-2.5 w-20 rounded bg-muted/60 animate-pulse" />
        <div className="h-3.5 w-36 rounded bg-muted/60 animate-pulse" />
      </div>
    </div>
  );
}

export default async function LessonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;

  return (
    <div className="flex flex-col xl:h-dvh bg-background">
      <header className="hidden h-16 border-b lg:flex items-center justify-between px-4 md:px-6 shrink-0 bg-card z-50">
        <Suspense fallback={<LessonHeaderFallback />}>
          <LessonHeaderContent lessonId={lessonId} />
        </Suspense>
      </header>

      <div className="flex-1 xl:overflow-hidden">{children}</div>
    </div>
  );
}
