"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquare,
  CheckCircle2,
  FolderTree,
  Download,
  Clock,
  Paperclip,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stream, type StreamPlayerApi } from "@cloudflare/stream-react";
import { useVideoProgress } from "@/components/lessons/use-video-progress";
import { ForumLessonQA } from "@/components/forum/forum-lesson-qa";
import type { TopicWithChildren } from "@/lib/queries/curriculum";
import type { ForumPostListItem, ForumReplyWithAuthor } from "@/lib/queries/forum";
import type { Video } from "@/lib/types/database";
import { formatBytes, formatShortDuration } from "@/lib/utils/format";

type QAThread = ForumPostListItem & { replies: ForumReplyWithAuthor[] };

interface LessonPlayerClientProps {
  lessonId: string;
  video: Video;
  curriculum: TopicWithChildren[];
  activeTopic: TopicWithChildren | null;
  classId: string;
  qaThreads: QAThread[];
  signedToken: string | null;
  customerCode: string;
  startSeconds: number;
  initialWatchSeconds: number;
  initialCompleted: boolean;
  userId: string;
  classEducatorId: string | null;
}

export function LessonPlayerClient({
  lessonId,
  video,
  curriculum,
  activeTopic,
  classId,
  qaThreads,
  signedToken,
  customerCode,
  startSeconds,
  initialWatchSeconds,
  initialCompleted,
  userId,
  classEducatorId,
}: LessonPlayerClientProps) {
  const flatVideos = curriculum.flatMap((topic) => [
    ...topic.videos.map((v) => v.id),
    ...topic.subtopics.flatMap((sub) => sub.videos.map((v) => v.id)),
  ]);
  const currentIndex = flatVideos.findIndex((id) => id === lessonId);
  const previousVideo = currentIndex > 0 ? flatVideos[currentIndex - 1] : null;
  const nextVideo = currentIndex !== -1 && currentIndex < flatVideos.length - 1 ? flatVideos[currentIndex + 1] : null;

  const streamRef = useRef<StreamPlayerApi | undefined>(undefined);
  const [playerReady, setPlayerReady] = useState(false);
  const { completed, recordProgress, markComplete, handleEnded } = useVideoProgress({
    userId,
    videoId: lessonId,
    initialWatchSeconds,
    initialCompleted,
  });

  const handleTimeUpdate = () => {
    const player = streamRef.current;
    if (player) recordProgress(player.currentTime, player.duration);
  };

  const isPlayable = video.status === "ready" && Boolean(signedToken);

  return (
    <div className="flex-1 flex flex-col lg:flex-row lg:h-full lg:overflow-hidden bg-background">
      <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 lg:overflow-y-auto">
        <div className="w-full aspect-video bg-black rounded-2xl shadow-2xl overflow-hidden relative border-4 border-card shrink-0">
          {isPlayable ? (
            <>
              <Stream
                src={signedToken!}
                customerCode={customerCode}
                controls
                responsive={false}
                height="100%"
                width="100%"
                streamRef={streamRef}
                startTime={startSeconds}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
                onLoadedData={() => setPlayerReady(true)}
                onCanPlay={() => setPlayerReady(true)}
                onError={() => setPlayerReady(true)}
                className="w-full h-full"
              />
              {!playerReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-white pointer-events-none">
                  <Spinner className="w-14 h-14 text-primary/80" />
                  <p className="mt-4 font-medium text-sm opacity-70">Loading video…</p>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-black/60 to-transparent text-white text-center px-6">
              {video.status === "errored" ? (
                <>
                  <AlertTriangle className="w-16 h-16 text-destructive/80" />
                  <p className="mt-4 font-medium text-lg opacity-80">This lesson failed to process</p>
                  <p className="mt-2 text-xs opacity-40">The educator will need to re-upload it.</p>
                </>
              ) : video.status === "ready" ? (
                <>
                  <Lock className="w-16 h-16 text-primary/80" />
                  <p className="mt-4 font-medium text-lg opacity-80">Video playback isn&apos;t available</p>
                  <p className="mt-2 text-xs opacity-40">Streaming is not configured yet.</p>
                </>
              ) : (
                <>
                  <Spinner className="w-16 h-16 text-primary/80" />
                  <p className="mt-4 font-medium text-lg opacity-80">Lesson is still processing</p>
                  <p className="mt-2 text-xs opacity-40">Check back in a few minutes.</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-6 shrink-0">
          {previousVideo ? (
            <Button asChild variant="outline" className="rounded-full gap-2 group">
              <Link href={`/lesson/${previousVideo}?from=${classId}`}>
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="hidden sm:inline">Previous</span>
              </Link>
            </Button>
          ) : (
            <Button variant="outline" className="rounded-full gap-2" disabled>
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
          )}

          <Button
            className="rounded-full gap-2 px-6 sm:px-8 font-bold shadow-lg shadow-primary/20"
            variant={completed ? "outline" : "default"}
            onClick={markComplete}
            disabled={completed || !isPlayable}
          >
            <span className="hidden sm:inline">{completed ? "Completed" : "Mark as Complete"}</span>
            <span className="sm:hidden">{completed ? "Done" : "Complete"}</span>
            <CheckCircle2 className="w-4 h-4" />
          </Button>

          {nextVideo ? (
            <Button asChild variant="outline" className="rounded-full gap-2 group">
              <Link href={`/lesson/${nextVideo}?from=${classId}`}>
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" className="rounded-full gap-2" disabled>
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <aside className="w-full border-t bg-card flex flex-col lg:h-full lg:w-[400px] lg:shrink-0 lg:border-l lg:border-t-0 xl:w-[450px]">
        <Tabs defaultValue="curriculum" className="w-full flex flex-col lg:h-full">
          <div className="p-4 border-b border-border bg-card shrink-0">
            <TabsList className="w-full grid grid-cols-3 bg-muted/50 p-1">
              <TabsTrigger value="curriculum" className="text-xs">
                <FolderTree className="w-3.5 h-3.5 mr-1.5 hidden sm:block" /> Course
              </TabsTrigger>
              <TabsTrigger value="overview" className="text-xs">
                <FileText className="w-3.5 h-3.5 mr-1.5 hidden sm:block" /> Info
              </TabsTrigger>
              <TabsTrigger value="discussion" className="text-xs">
                <MessageSquare className="w-3.5 h-3.5 mr-1.5 hidden sm:block" /> Q&A
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 p-0 flex flex-col relative lg:overflow-y-auto">
            <TabsContent value="curriculum" className="m-0 border-none outline-none">
              <div className="p-4 border-b bg-card z-20 backdrop-blur-md lg:sticky lg:top-0">
                <h2 className="font-bold text-sm">{activeTopic?.title ?? "Course Content"}</h2>
              </div>
              <div className="flex flex-col">
                {activeTopic && activeTopic.items.length > 0 && (
                  <div className="p-4 bg-primary/5 border-b border-border/50 flex flex-col gap-2">
                    <div className="text-xs sm:text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Topic Materials</div>
                    {activeTopic.items.map((item) => {
                      if (item.kind === "video") {
                        const isActive = item.id === lessonId;
                        return (
                          <Link
                            key={item.placement_id}
                            href={`/lesson/${item.id}?from=${classId}`}
                            className={`flex items-center gap-3 p-3 bg-card border rounded-lg hover:border-primary/50 hover:shadow-sm transition-all group ${
                              isActive ? "border-primary" : "border-primary/20"
                            }`}
                          >
                            <div className="p-2 bg-primary/10 rounded-md text-primary group-hover:bg-primary/20 transition-colors">
                              {item.is_completed || (isActive && completed) ? (
                                <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                <FileText className="w-4 h-4" />
                              )}
                            </div>
                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors leading-tight flex-1 min-w-0 truncate">
                              {item.title}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">{formatShortDuration(item.duration)}</span>
                          </Link>
                        );
                      }
                      return (
                        <a
                          key={item.placement_id}
                          href={`/api/resources/${item.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 bg-card border border-primary/20 rounded-lg hover:border-primary/50 hover:shadow-sm transition-all group"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="shrink-0 p-2 bg-primary/10 rounded-md text-primary group-hover:bg-primary/20 transition-colors">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors leading-tight break-words">
                                {item.title}
                              </span>
                              <span className="text-xs text-muted-foreground mt-0.5">{formatBytes(item.size_bytes)} • PDF</span>
                            </div>
                          </div>
                          <Download className="w-4 h-4 shrink-0 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 group-hover:text-primary transition-all mr-2" />
                        </a>
                      );
                    })}
                  </div>
                )}

                {activeTopic?.subtopics.map((subtopic) => (
                  <div key={subtopic.id} className="border-b border-border/50 last:border-0 pb-2">
                    <div className="bg-muted/30 px-4 py-2 text-xs sm:text-[10px] font-bold text-muted-foreground uppercase tracking-widest break-words backdrop-blur-md z-10 border-b border-border/50 lg:sticky lg:top-[53px]">
                      {subtopic.title}
                    </div>

                    <div className="flex flex-col">
                      {subtopic.items.map((item) => {
                        if (item.kind === "note") {
                          return (
                            <a
                              key={item.placement_id}
                              href={`/api/resources/${item.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-3 px-5 hover:bg-muted/50 transition-colors group border-b border-border/50 last:border-0"
                            >
                              <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="min-w-0 flex-1 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors truncate">
                                {item.title}
                              </span>
                              <span className="text-xs sm:text-[10px] text-muted-foreground ml-auto border border-border px-1.5 py-0.5 rounded bg-background shrink-0">
                                {formatBytes(item.size_bytes)}
                              </span>
                            </a>
                          );
                        }
                        const isActive = item.id === lessonId;
                        const isVideoCompleted = item.is_completed || (isActive && completed);
                        return (
                          <Link
                            key={item.placement_id}
                            href={`/lesson/${item.id}?from=${classId}`}
                            className={`flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 ${
                              isActive ? "bg-primary/5 border-l-4 border-l-primary" : "border-l-4 border-l-transparent"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {isVideoCompleted ? (
                                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                              ) : (
                                <div
                                  className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 ${isActive ? "border-primary" : "border-muted-foreground/30"}`}
                                />
                              )}
                              <span
                                className={`min-w-0 flex-1 break-words text-sm font-semibold leading-tight ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                              >
                                {item.title}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground font-medium ml-7">{formatShortDuration(item.duration)}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="overview" className="m-0 p-6 space-y-4 outline-none">
              <h3 className="text-xl font-bold break-words">{video.title}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium mb-4">
                <Clock className="w-4 h-4" />
                {formatShortDuration(video.duration)}
              </div>
              <p className="text-muted-foreground leading-relaxed text-sm whitespace-pre-line break-words">
                {video.description ?? "No description provided for this lesson yet."}
              </p>
            </TabsContent>

            <TabsContent value="discussion" className="m-0 flex flex-col lg:h-full outline-none">
              <ForumLessonQA classId={classId} lessonId={lessonId} threads={qaThreads} classEducatorId={classEducatorId} currentUserId={userId} />
            </TabsContent>
          </div>
        </Tabs>
      </aside>
    </div>
  );
}
