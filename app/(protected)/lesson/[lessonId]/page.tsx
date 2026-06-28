import { notFound, redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getClassIdsForVideo, getCurriculumForClass, getVideoById } from "@/lib/queries/curriculum";
import { getQAThreadsForVideo } from "@/lib/queries/forum";
import { getVideoProgress } from "@/lib/queries/video-progress";
import { createClient } from "@/lib/supabase/server";
import { generateStreamToken } from "@/lib/cloudflare/token";
import { intervalToSeconds } from "@/lib/utils/format";
import { LessonPlayerClient } from "@/components/lessons/lesson-player-client";

export default async function LessonPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { lessonId } = await params;
  const { from } = await searchParams;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");

  const video = await getVideoById(lessonId);
  if (!video) notFound();

  /* A library video can be placed in several classes; the viewer needs access
     to at least one of them. A signed token is a real capability grant, so
     access is verified explicitly here rather than relying solely on the RLS
     that gated getVideoById. The resolved classId scopes the curriculum
     sidebar, Q&A, and back link to a class the viewer actually belongs to. */
  const classIds = await getClassIdsForVideo(lessonId);
  if (classIds.length === 0) notFound();

  const supabase = await createClient();
  const [{ data: enrollRows }, { data: ownedRows }] = await Promise.all([
    supabase
      .from("class_enrollments")
      .select("class_id")
      .eq("user_id", profile.id)
      .in("class_id", classIds),
    supabase.from("classes").select("id").in("id", classIds).eq("educator_id", profile.id),
  ]);
  const accessibleIds = new Set<string>([
    ...((enrollRows ?? []) as Array<{ class_id: string }>).map((r) => r.class_id),
    ...((ownedRows ?? []) as Array<{ id: string }>).map((r) => r.id),
  ]);
  const isOwner = video.owner_id === profile.id;
  const canAccess = (id: string) =>
    accessibleIds.has(id) || profile.role === "admin" || isOwner;
  /* Honour ?from=<classId> when the viewer can actually access that class and
     the video is placed there; otherwise fall back to any accessible class. The
     `from` value is validated, never trusted. */
  const fromClassId = from && classIds.includes(from) && canAccess(from) ? from : null;
  const classId =
    fromClassId ??
    classIds.find((id) => accessibleIds.has(id)) ??
    (profile.role === "admin" || isOwner ? classIds[0] : null);
  if (!classId) notFound();

  const [curriculum, qaThreads, progress] = await Promise.all([
    getCurriculumForClass(classId, profile.id),
    getQAThreadsForVideo(lessonId, classId),
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

  const activeTopic = curriculum.find(
    (topic) =>
      topic.videos.some((v) => v.id === lessonId) ||
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
