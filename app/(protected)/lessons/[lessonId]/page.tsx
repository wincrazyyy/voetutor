import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassIdForVideo, getCurriculumForClass, getVideoById } from "@/lib/queries/curriculum";
import { getQAThreadsForVideo } from "@/lib/queries/forum";
import { getVideoProgress } from "@/lib/queries/video-progress";
import { createClient } from "@/lib/supabase/server";
import { generateStreamToken } from "@/lib/cloudflare/token";
import { intervalToSeconds } from "@/lib/utils/format";
import { LessonPlayerClient } from "@/components/lessons/lesson-player-client";

export default async function LessonPlayerPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const video = await getVideoById(lessonId);
  if (!video) notFound();

  const classId = await getClassIdForVideo(lessonId);
  if (!classId) notFound();

  /* Explicit membership check before minting a playback token. A signed
     token is a real capability grant, so access is verified locally here
     rather than relying solely on the RLS that gated getVideoById. */
  const supabase = await createClient();
  const [{ data: classRow }, { data: enrollment }] = await Promise.all([
    supabase.from("classes").select("educator_id").eq("id", classId).maybeSingle(),
    supabase
      .from("class_enrollments")
      .select("user_id")
      .eq("class_id", classId)
      .eq("user_id", profile.id)
      .maybeSingle(),
  ]);
  const isEducator = (classRow as { educator_id: string | null } | null)?.educator_id === profile.id;
  const hasAccess = profile.role === "admin" || isEducator || Boolean(enrollment);
  if (!hasAccess) notFound();

  const [curriculum, qaThreads, progress] = await Promise.all([
    getCurriculumForClass(classId, profile.id),
    getQAThreadsForVideo(lessonId),
    getVideoProgress(profile.id, lessonId),
  ]);

  /* A playback token is minted only for a fully encoded video. If Cloudflare
     is not configured the token mint fails softly and the player shows a
     non-ready state instead of crashing the page. */
  let signedToken: string | null = null;
  if (video.status === "ready" && video.cloudflare_uid) {
    try {
      signedToken = await generateStreamToken(video.cloudflare_uid);
    } catch {
      signedToken = null;
    }
  }

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
      signedToken={signedToken}
      customerCode={process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE ?? ""}
      startSeconds={intervalToSeconds(progress?.last_position ?? null)}
      initialWatchSeconds={intervalToSeconds(progress?.total_watch_time ?? null)}
      initialCompleted={progress?.is_completed ?? false}
      userId={profile.id}
    />
  );
}
