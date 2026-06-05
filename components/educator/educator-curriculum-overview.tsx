"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  FileText,
  FolderTree,
  GripVertical,
  Lock,
  PlayCircle,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  SubtopicWithChildren,
  TopicWithChildren,
  VideoWithProgress,
} from "@/lib/queries/curriculum";
import type { VideoStatus } from "@/lib/types/database";
import { formatBytes, formatShortDuration } from "@/lib/utils/format";
import { reorderSubtopicVideosAction } from "@/app/actions/curriculum";
import { TopicFormDialog } from "@/components/educator/topic-form-dialog";
import { SubtopicFormDialog } from "@/components/educator/subtopic-form-dialog";
import { DeleteCurriculumItemButton } from "@/components/educator/delete-curriculum-item-button";
import { VideoUploadDialog } from "@/components/educator/video-upload-dialog";
import { VideoRenameDialog } from "@/components/educator/video-rename-dialog";

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

/**
 * Droppable ids are namespaced so a single DndContext can host three kinds of
 * targets: a video item is a raw UUID (no colon), a subtopic container is
 * "sub:<id>", and a topic header is "topic:<id>". Prefer the innermost hit — a
 * video over its container over its topic — so insertion is precise.
 */
const detectCollisions: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const candidates = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
  const video = candidates.find((c) => !String(c.id).includes(":"));
  if (video) return [video];
  const subtopic = candidates.find((c) => String(c.id).startsWith("sub:"));
  if (subtopic) return [subtopic];
  return candidates.length > 0 ? [candidates[0]] : [];
};

function findVideo(topics: TopicWithChildren[], videoId: string): VideoWithProgress | null {
  for (const topic of topics) {
    for (const subtopic of topic.subtopics) {
      const found = subtopic.videos.find((video) => video.id === videoId);
      if (found) return found;
    }
  }
  return null;
}

interface ReorderResult {
  nextTopics: TopicWithChildren[];
  targetOrderedIds: string[];
}

/**
 * Pure helper: produces the optimistic topic tree after dropping `activeId` into
 * `targetSubtopicId` (before `overVideoId`, or at the end when null), plus the
 * destination subtopic's resulting ordered id list for persistence. Returns null
 * when the drop is a no-op.
 */
function computeReorder(
  topics: TopicWithChildren[],
  activeId: string,
  sourceSubtopicId: string,
  targetSubtopicId: string,
  overVideoId: string | null,
): ReorderResult | null {
  const activeVideo = findVideo(topics, activeId);
  if (!activeVideo) return null;

  const nextTopics = topics.map((topic) => ({
    ...topic,
    subtopics: topic.subtopics.map((subtopic) => ({
      ...subtopic,
      videos: [...subtopic.videos],
    })),
  }));

  const allSubtopics = nextTopics.flatMap((topic) => topic.subtopics);
  const source = allSubtopics.find((subtopic) => subtopic.id === sourceSubtopicId);
  const target = allSubtopics.find((subtopic) => subtopic.id === targetSubtopicId);
  if (!source || !target) return null;

  const removeIndex = source.videos.findIndex((video) => video.id === activeId);
  if (removeIndex === -1) return null;
  source.videos.splice(removeIndex, 1);

  let insertIndex = target.videos.length;
  if (overVideoId) {
    const overIndex = target.videos.findIndex((video) => video.id === overVideoId);
    if (overIndex !== -1) insertIndex = overIndex;
  }
  target.videos.splice(insertIndex, 0, activeVideo);

  const targetOrderedIds = target.videos.map((video) => video.id);

  if (sourceSubtopicId === targetSubtopicId) {
    const original =
      topics
        .flatMap((topic) => topic.subtopics)
        .find((subtopic) => subtopic.id === sourceSubtopicId)
        ?.videos.map((video) => video.id) ?? [];
    if (
      original.length === targetOrderedIds.length &&
      original.every((id, index) => id === targetOrderedIds[index])
    ) {
      return null;
    }
  }

  return { nextTopics, targetOrderedIds };
}

function SortableVideoRow({
  video,
  classId,
  subtopicId,
}: {
  video: VideoWithProgress;
  classId: string;
  subtopicId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: video.id,
    data: { type: "video", subtopicId },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const statusLabel = videoStatusLabel(video.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 border-b border-border/50 last:border-0 bg-card hover:bg-muted/50 transition-colors group ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <button
        type="button"
        className="pl-3 pr-1 py-3 text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
        aria-label="Drag to reorder or move to another subtopic"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <Link href={`/lessons/${video.id}`} className="flex items-center gap-3 py-3 flex-1 min-w-0">
        <PlayCircle className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
        <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">
          {video.title}
        </span>
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
      </Link>
      <div className="flex items-center gap-1 shrink-0 pr-2">
        <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded bg-background">
          {formatShortDuration(video.duration)}
        </span>
        <VideoRenameDialog videoId={video.id} classId={classId} initialTitle={video.title} />
      </div>
    </div>
  );
}

function SubtopicVideoList({
  subtopic,
  classId,
}: {
  subtopic: SubtopicWithChildren;
  classId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `sub:${subtopic.id}`,
    data: { type: "subtopic", subtopicId: subtopic.id },
  });
  const videoIds = subtopic.videos.map((video) => video.id);

  return (
    <div ref={setNodeRef} className={isOver ? "bg-primary/5" : ""}>
      <SortableContext items={videoIds} strategy={verticalListSortingStrategy}>
        {subtopic.videos.map((video) => (
          <SortableVideoRow
            key={video.id}
            video={video}
            classId={classId}
            subtopicId={subtopic.id}
          />
        ))}
      </SortableContext>
      {subtopic.videos.length === 0 && (
        <div
          className={`m-2 flex min-h-[64px] items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center text-xs italic transition-colors ${
            isOver
              ? "border-primary/40 bg-primary/5 text-primary"
              : "border-border/50 text-muted-foreground"
          }`}
        >
          Drop a video here, or use Add Video above.
        </div>
      )}
    </div>
  );
}

function TopicSection({ topic, classId }: { topic: TopicWithChildren; classId: string }) {
  const { setNodeRef } = useDroppable({
    id: `topic:${topic.id}`,
    data: { type: "topic", topicId: topic.id },
  });

  return (
    <AccordionItem
      value={topic.id}
      className="bg-card rounded-xl border border-border shadow-sm overflow-hidden relative"
    >
      <div
        className={`absolute top-0 left-0 w-full h-1 ${topic.status === "active" ? "bg-primary" : "bg-muted"}`}
      />
      <AccordionTrigger className="p-5 bg-muted/10 hover:bg-muted/40 transition-colors border-b border-border hover:no-underline [&[data-state=open]]:bg-muted/40 text-left pt-6">
        <div ref={setNodeRef} className="flex flex-col gap-3 w-full pr-2">
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
            <span className="shrink-0">
              {topic.total_videos} {topic.total_videos === 1 ? "Video" : "Videos"}
            </span>
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
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              Topic Resources
            </span>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-primary" disabled>
              <Plus className="w-3 h-3" />
              Add Resource
            </Button>
          </div>
          {topic.resources.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground italic border-b border-border/50">
              No topic-level resources.
            </div>
          ) : (
            <div className="border-b border-border/50">
              {topic.resources.map((res) => (
                <div
                  key={res.id}
                  className="flex items-center gap-3 p-3 px-4 border-b border-border/50 last:border-0"
                >
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
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
                  {subtopic.title}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <VideoUploadDialog
                    subtopicId={subtopic.id}
                    classId={classId}
                    subtopicLabel={`${topic.title} / ${subtopic.title}`}
                  />
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

              {subtopic.resources.map((res) => (
                <div
                  key={res.id}
                  className="flex items-center gap-3 p-3 px-5 border-b border-border/50 bg-muted/5"
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground truncate">
                    {res.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto border border-border px-1.5 py-0.5 rounded bg-background shrink-0">
                    {formatBytes(res.size_bytes)}
                  </span>
                </div>
              ))}

              <SubtopicVideoList subtopic={subtopic} classId={classId} />
            </div>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function EducatorCurriculumOverview({ classId, curriculum }: EducatorCurriculumOverviewProps) {
  const router = useRouter();
  const [topics, setTopics] = useState<TopicWithChildren[]>(curriculum);
  const [openTopics, setOpenTopics] = useState<string[]>([]);
  const [activeVideo, setActiveVideo] = useState<VideoWithProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setTopics(curriculum);
  }, [curriculum]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setError(null);
    setActiveVideo(findVideo(topics, String(event.active.id)));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    if (overId?.startsWith("topic:")) {
      const topicId = overId.slice("topic:".length);
      setOpenTopics((prev) => (prev.includes(topicId) ? prev : [...prev, topicId]));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveVideo(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const sourceSubtopicId = active.data.current?.subtopicId as string | undefined;
    if (!sourceSubtopicId) return;

    let targetSubtopicId: string;
    let overVideoId: string | null = null;
    if (overId.startsWith("sub:")) {
      targetSubtopicId = overId.slice("sub:".length);
    } else if (overId.startsWith("topic:")) {
      return;
    } else {
      if (overId === activeId) return;
      overVideoId = overId;
      targetSubtopicId = (over.data.current?.subtopicId as string | undefined) ?? "";
    }
    if (!targetSubtopicId) return;

    const result = computeReorder(topics, activeId, sourceSubtopicId, targetSubtopicId, overVideoId);
    if (!result) return;

    setTopics(result.nextTopics);
    startTransition(async () => {
      const response = await reorderSubtopicVideosAction(
        classId,
        targetSubtopicId,
        result.targetOrderedIds,
      );
      if (response?.error) {
        /* Revert to the last server-confirmed tree rather than a possibly-stale
           optimistic snapshot, so a failed drop can't clobber a concurrent one. */
        setTopics(curriculum);
        setError(response.error);
        return;
      }
      router.refresh();
    });
  };

  const handleDragCancel = () => setActiveVideo(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FolderTree className="w-6 h-6 text-primary" />
          Curriculum
        </h2>
        <TopicFormDialog classId={classId} mode="create" />
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="shrink-0 hover:opacity-70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {topics.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
          <FolderTree className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold mb-1">No topics yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Use <span className="font-semibold text-foreground">Add Topic</span> above to start building this class&apos;s curriculum. Each topic holds subtopics, and each subtopic holds video lessons.
          </p>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={detectCollisions}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <Accordion
            type="multiple"
            value={openTopics}
            onValueChange={setOpenTopics}
            className="w-full flex flex-col gap-4"
          >
            {topics.map((topic) => (
              <TopicSection key={topic.id} topic={topic} classId={classId} />
            ))}
          </Accordion>
          <DragOverlay>
            {activeVideo ? (
              <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-card shadow-lg px-4 py-3">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <PlayCircle className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">{activeVideo.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
