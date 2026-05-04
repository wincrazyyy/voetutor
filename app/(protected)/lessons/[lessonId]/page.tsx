import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassIdForVideo, getCurriculumForClass, getVideoById } from "@/lib/queries/curriculum";
import { getQAThreadsForVideo } from "@/lib/queries/forum";
import { LessonPlayerClient } from "@/components/lessons/lesson-player-client";

export default async function LessonPlayerPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const video = await getVideoById(lessonId);
  if (!video) notFound();

  const classId = await getClassIdForVideo(lessonId);
  if (!classId) notFound();

  const [curriculum, qaThreads] = await Promise.all([
    getCurriculumForClass(classId, profile.id),
    getQAThreadsForVideo(lessonId),
  ]);

  const activeTopic = curriculum.find((topic) =>
    topic.subtopics.some((sub) => sub.videos.some((v) => v.id === lessonId)),
  );

  return (
    <LessonPlayerClient
      lessonId={lessonId}
      video={video}
      curriculum={curriculum}
      activeTopic={activeTopic ?? null}
      classId={classId}
      qaThreads={qaThreads}
    />
  );
}
