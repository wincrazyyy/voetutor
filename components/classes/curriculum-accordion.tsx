import Link from "next/link";
import { CheckCircle2, Clock, FolderTree, FileText, Download, Paperclip, PlayCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { NoteWithPlacement, VideoWithProgress } from "@/lib/queries/curriculum";
import type { TopicWithChildren } from "@/lib/queries/curriculum";
import { formatBytes, formatShortDuration } from "@/lib/utils/format";

interface CurriculumAccordionProps {
  curriculum: TopicWithChildren[];
  classId: string;
}

function VideoLink({ video, classId }: { video: VideoWithProgress; classId: string }) {
  return (
    <Link
      href={`/lesson/${video.id}?from=${classId}`}
      className="flex flex-col gap-1.5 p-4 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {video.is_completed ? (
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <PlayCircle className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </div>
        <span className={`font-medium text-sm leading-tight ${video.is_completed ? "text-muted-foreground" : "text-foreground"}`}>
          {video.title}
        </span>
      </div>
      <div className="text-xs text-muted-foreground font-medium ml-7">{formatShortDuration(video.duration)}</div>
    </Link>
  );
}

function NoteLink({ note }: { note: NoteWithPlacement }) {
  return (
    <a
      href={`/api/resources/${note.id}/download`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 px-5 hover:bg-muted/50 transition-colors group border-b border-border/50 last:border-0"
    >
      <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors truncate">
        {note.title}
      </span>
      <span className="text-[10px] text-muted-foreground ml-auto border border-border px-1.5 py-0.5 rounded bg-background shrink-0">
        {formatBytes(note.size_bytes)}
      </span>
    </a>
  );
}

export function CurriculumAccordion({ curriculum, classId }: CurriculumAccordionProps) {
  if (curriculum.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Curriculum</h2>
        <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
          No topics available yet. Your educator is preparing the curriculum.
        </div>
      </div>
    );
  }

  const activeTopic = curriculum.find((t) => t.status === "active");
  const defaultValue = activeTopic?.id ?? curriculum[0].id;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Curriculum</h2>
      <Accordion type="single" collapsible defaultValue={defaultValue} className="w-full flex flex-col gap-4">
        {curriculum.map((topic) => {
          const totalVideos = topic.total_videos;
          const hasTopicMaterials = topic.items.length > 0;

          return (
            <AccordionItem
              key={topic.id}
              value={topic.id}
              className="bg-card rounded-xl border border-border shadow-sm overflow-hidden relative"
            >
              <div className={`absolute top-0 left-0 w-full h-1 ${topic.status === "active" ? "bg-primary" : "bg-muted"}`}></div>

              <AccordionTrigger className="p-5 md:p-6 bg-muted/10 hover:bg-muted/40 transition-colors border-b border-border hover:no-underline [&[data-state=open]]:bg-muted/40 text-left pt-6">
                <div className="flex flex-col gap-3 w-full pr-2">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-base font-bold leading-tight">{topic.title}</h3>
                    <div className="shrink-0 mt-0.5">
                      {topic.status === "completed" && <CheckCircle2 className="w-4 h-4 text-primary" />}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground font-medium">
                    <span className="flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" /> {formatShortDuration(topic.total_duration)}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <FolderTree className="w-3 h-3" /> {topic.subtopics.length}
                    </span>
                    <span className="shrink-0">
                      {topic.watched_videos} / {totalVideos} {totalVideos === 1 ? "Video" : "Videos"}
                    </span>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="p-0 border-none">
                <div className="flex flex-col">
                  {hasTopicMaterials && (
                    <div className="p-4 bg-primary/5 border-b border-border/50 flex flex-col gap-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Topic Materials</div>
                      {topic.items.map((item) =>
                        item.kind === "video" ? (
                          <Link
                            key={item.placement_id}
                            href={`/lesson/${item.id}?from=${classId}`}
                            className="flex items-center gap-3 p-3 bg-card border border-primary/20 rounded-lg hover:border-primary/50 hover:shadow-sm transition-all group"
                          >
                            <div className="p-2 bg-primary/10 rounded-md text-primary group-hover:bg-primary/20 transition-colors">
                              {item.is_completed ? <CheckCircle2 className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                            </div>
                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors leading-tight flex-1 min-w-0 truncate">
                              {item.title}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">{formatShortDuration(item.duration)}</span>
                          </Link>
                        ) : (
                          <a
                            key={item.placement_id}
                            href={`/api/resources/${item.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-3 bg-card border border-primary/20 rounded-lg hover:border-primary/50 hover:shadow-sm transition-all group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 bg-primary/10 rounded-md text-primary group-hover:bg-primary/20 transition-colors">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors leading-tight truncate">
                                  {item.title}
                                </span>
                                <span className="text-xs text-muted-foreground mt-0.5">{formatBytes(item.size_bytes)} • PDF</span>
                              </div>
                            </div>
                            <Download className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all mr-2 shrink-0" />
                          </a>
                        ),
                      )}
                    </div>
                  )}

                  {topic.subtopics.map((subtopic) => (
                    <div key={subtopic.id} className="border-b border-border/50 last:border-0">
                      <div className="bg-muted/20 px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/50">
                        {subtopic.title}
                      </div>

                      <div className="flex flex-col">
                        {subtopic.items.length > 0 ? (
                          subtopic.items.map((item) =>
                            item.kind === "video" ? (
                              <VideoLink key={item.placement_id} video={item} classId={classId} />
                            ) : (
                              <NoteLink key={item.placement_id} note={item} />
                            ),
                          )
                        ) : (
                          <div className="px-4 py-3 text-xs text-muted-foreground italic">No content yet.</div>
                        )}
                      </div>
                    </div>
                  ))}

                  {topic.subtopics.length === 0 && !hasTopicMaterials && (
                    <div className="px-4 py-4 text-xs text-muted-foreground italic">No subtopics yet.</div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
