import {
  CheckCircle2,
  Clock,
  FileText,
  FolderTree,
  Lock,
  PlayCircle,
  Plus,
} from "lucide-react";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TopicWithChildren } from "@/lib/queries/curriculum";
import type { VideoStatus } from "@/lib/types/database";
import { formatBytes, formatShortDuration } from "@/lib/utils/format";
import { TopicFormDialog } from "@/components/educator/topic-form-dialog";
import { SubtopicFormDialog } from "@/components/educator/subtopic-form-dialog";
import { DeleteCurriculumItemButton } from "@/components/educator/delete-curriculum-item-button";
import { VideoUploadDialog } from "@/components/educator/video-upload-dialog";

interface EducatorCurriculumOverviewProps {
  classId: string;
  curriculum: TopicWithChildren[];
}

function videoStatusLabel(status: VideoStatus): string | null {
  if (status === "ready") return null;
  if (status === "errored") return "Failed";
  return "Processing";
}

function pluralise(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function EducatorCurriculumOverview({ classId, curriculum }: EducatorCurriculumOverviewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FolderTree className="w-6 h-6 text-primary" />
          Curriculum
        </h2>
        <TopicFormDialog classId={classId} mode="create" />
      </div>

      {curriculum.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
          <FolderTree className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold mb-1">No topics yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Use <span className="font-semibold text-foreground">Add Topic</span> above to start building this class&apos;s curriculum. Each topic holds subtopics, and each subtopic holds video lessons.
          </p>
        </Card>
      ) : (
        <Accordion type="multiple" className="w-full flex flex-col gap-4">
          {curriculum.map((topic) => (
            <AccordionItem
              key={topic.id}
              value={topic.id}
              className="bg-card rounded-xl border border-border shadow-sm overflow-hidden relative"
            >
              <div className={`absolute top-0 left-0 w-full h-1 ${topic.status === "active" ? "bg-primary" : "bg-muted"}`} />
              <AccordionTrigger className="p-5 bg-muted/10 hover:bg-muted/40 transition-colors border-b border-border hover:no-underline [&[data-state=open]]:bg-muted/40 text-left pt-6">
                <div className="flex flex-col gap-3 w-full pr-2">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-base font-bold leading-tight">{topic.title}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="secondary"
                        className="text-[9px] uppercase tracking-wider font-bold capitalize bg-muted text-muted-foreground pointer-events-none"
                      >
                        {topic.status}
                      </Badge>
                      {topic.status === "completed" && <CheckCircle2 className="w-4 h-4 text-primary" />}
                      {topic.status === "locked" && <Lock className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground font-medium">
                    <span className="flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" /> {formatShortDuration(topic.total_duration)}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <FolderTree className="w-3 h-3" /> {topic.subtopics.length}
                    </span>
                    <span className="shrink-0">{topic.total_videos} {topic.total_videos === 1 ? "Video" : "Videos"}</span>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="p-0 border-none">
                <div className="flex flex-col">
                  <div className="p-3 bg-muted/20 border-b border-border/50 flex items-center justify-between gap-2">
                    <SubtopicFormDialog topicId={topic.id} classId={classId} mode="create" />
                    <div className="flex items-center gap-1">
                      <TopicFormDialog
                        classId={classId}
                        mode="rename"
                        topicId={topic.id}
                        initialTitle={topic.title}
                      />
                      <DeleteCurriculumItemButton
                        kind="topic"
                        itemId={topic.id}
                        classId={classId}
                        name={topic.title}
                        summary={`${pluralise(topic.subtopics.length, "subtopic")} and ${pluralise(topic.total_videos, "video")}`}
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-primary/5 border-b border-border/50 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Topic Resources</span>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-primary" disabled>
                      <Plus className="w-3 h-3" />
                      Add Resource
                    </Button>
                  </div>
                  {topic.resources.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-muted-foreground italic border-b border-border/50">No topic-level resources.</div>
                  ) : (
                    <div className="border-b border-border/50">
                      {topic.resources.map((res) => (
                        <div key={res.id} className="flex items-center gap-3 p-3 px-4 border-b border-border/50 last:border-0">
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm font-medium truncate">{res.title}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto border border-border px-1.5 py-0.5 rounded bg-background shrink-0">
                            {formatBytes(res.size_bytes)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {topic.subtopics.map((subtopic) => (
                    <div key={subtopic.id} className="border-b border-border/50 last:border-0">
                      <div className="bg-muted/20 px-4 py-2.5 flex items-center justify-between gap-2 border-b border-border/50">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">{subtopic.title}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <VideoUploadDialog subtopicId={subtopic.id} />
                          <SubtopicFormDialog
                            topicId={topic.id}
                            classId={classId}
                            mode="rename"
                            subtopicId={subtopic.id}
                            initialTitle={subtopic.title}
                          />
                          <DeleteCurriculumItemButton
                            kind="subtopic"
                            itemId={subtopic.id}
                            classId={classId}
                            name={subtopic.title}
                            summary={pluralise(subtopic.videos.length, "video")}
                          />
                        </div>
                      </div>

                      {subtopic.videos.length === 0 && subtopic.resources.length === 0 && (
                        <div className="px-4 py-3 text-xs text-muted-foreground italic">No content yet.</div>
                      )}

                      {subtopic.resources.map((res) => (
                        <div
                          key={res.id}
                          className="flex items-center gap-3 p-3 px-5 border-b border-border/50 last:border-0 bg-muted/5"
                        >
                          <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-muted-foreground truncate">{res.title}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto border border-border px-1.5 py-0.5 rounded bg-background shrink-0">
                            {formatBytes(res.size_bytes)}
                          </span>
                        </div>
                      ))}

                      {subtopic.videos.map((video) => {
                        const statusLabel = videoStatusLabel(video.status);
                        return (
                          <Link
                            key={video.id}
                            href={`/lessons/${video.id}`}
                            className="flex items-center gap-3 p-3 px-4 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors group"
                          >
                            <PlayCircle className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                            <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">{video.title}</span>
                            {statusLabel && (
                              <Badge
                                variant="secondary"
                                className={`text-[9px] uppercase tracking-wider font-bold shrink-0 ${
                                  video.status === "errored"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {statusLabel}
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto border border-border px-1.5 py-0.5 rounded bg-background shrink-0">
                              {formatShortDuration(video.duration)}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
