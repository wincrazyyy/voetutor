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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  NoteWithPlacement,
  SubtopicWithChildren,
  TopicWithChildren,
  VideoWithProgress,
} from "@/lib/queries/curriculum";
import type { LibraryVideo } from "@/lib/queries/video-library";
import type { LibraryNote } from "@/lib/queries/note-library";
import type { VideoStatus } from "@/lib/types/database";
import { formatBytes, formatShortDuration } from "@/lib/utils/format";
import { reorderPlacedVideosAction } from "@/app/actions/curriculum";
import { TopicFormDialog } from "@/components/educator/topic-form-dialog";
import { SubtopicFormDialog } from "@/components/educator/subtopic-form-dialog";
import { DeleteCurriculumItemButton } from "@/components/educator/delete-curriculum-item-button";
import { AddVideosToSubtopicDialog } from "@/components/educator/add-videos-to-subtopic-dialog";
import { AddNotesToParentDialog } from "@/components/educator/add-notes-to-parent-dialog";
import { UnplaceVideoButton } from "@/components/educator/unplace-video-button";
import { UnplaceNoteButton } from "@/components/educator/unplace-note-button";
import { VideoRenameDialog } from "@/components/educator/video-rename-dialog";
import { NoteRenameDialog } from "@/components/educator/note-rename-dialog";

interface EducatorCurriculumOverviewProps {
  classId: string;
  curriculum: TopicWithChildren[];
  libraryVideos: LibraryVideo[];
  libraryNotes: LibraryNote[];
}

function videoStatusLabel(status: VideoStatus): string | null {
  if (status === "ready") return null;
  if (status === "errored") return "Failed";
  return "Processing";
}

function pluralise(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const detectCollisions: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const candidates = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
  const row = candidates.find((c) => !String(c.id).includes(":"));
  if (row) return [row];
  const subtopic = candidates.find((c) => String(c.id).startsWith("sub:"));
  if (subtopic) return [subtopic];
  return candidates.length > 0 ? [candidates[0]] : [];
};

/** Search only subtopic video lists — the dnd board reorders subtopic-level placements. */
function findByPlacement(topics: TopicWithChildren[], placementId: string): VideoWithProgress | null {
  for (const topic of topics) {
    for (const subtopic of topic.subtopics) {
      const found = subtopic.videos.find((video) => video.placement_id === placementId);
      if (found) return found;
    }
  }
  return null;
}

interface ReorderResult {
  nextTopics: TopicWithChildren[];
  targetOrderedPlacementIds: string[];
}

function computeReorder(
  topics: TopicWithChildren[],
  activeId: string,
  sourceSubtopicId: string,
  targetSubtopicId: string,
  overPlacementId: string | null,
): ReorderResult | null {
  const activeVideo = findByPlacement(topics, activeId);
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

  const removeIndex = source.videos.findIndex((video) => video.placement_id === activeId);
  if (removeIndex === -1) return null;
  source.videos.splice(removeIndex, 1);

  let insertIndex = target.videos.length;
  if (overPlacementId) {
    const overIndex = target.videos.findIndex((video) => video.placement_id === overPlacementId);
    if (overIndex !== -1) insertIndex = overIndex;
  }
  target.videos.splice(insertIndex, 0, activeVideo);

  const targetOrderedPlacementIds = target.videos.map((video) => video.placement_id);

  if (sourceSubtopicId === targetSubtopicId) {
    const original =
      topics
        .flatMap((topic) => topic.subtopics)
        .find((subtopic) => subtopic.id === sourceSubtopicId)
        ?.videos.map((video) => video.placement_id) ?? [];
    if (
      original.length === targetOrderedPlacementIds.length &&
      original.every((id, index) => id === targetOrderedPlacementIds[index])
    ) {
      return null;
    }
  }

  return { nextTopics, targetOrderedPlacementIds };
}

function NoteRow({ note, classId, onError }: { note: NoteWithPlacement; classId: string; onError: (m: string) => void }) {
  return (
    <div className="flex items-center gap-3 p-3 px-5 border-b border-border/50 bg-muted/5 last:border-0">
      <a
        href={`/api/resources/${note.id}/download`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 min-w-0 flex-1 hover:text-foreground transition-colors"
      >
        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-muted-foreground truncate">{note.title}</span>
      </a>
      <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded bg-background shrink-0">
        {formatBytes(note.size_bytes)}
      </span>
      <NoteRenameDialog resourceId={note.id} classId={classId} initialTitle={note.title} />
      <UnplaceNoteButton placementId={note.placement_id} onError={onError} />
    </div>
  );
}

function TopicVideoRow({ video, classId, onError }: { video: VideoWithProgress; classId: string; onError: (m: string) => void }) {
  const statusLabel = videoStatusLabel(video.status);
  return (
    <div className="flex items-center gap-3 p-3 px-5 border-b border-border/50 bg-muted/5 last:border-0 group">
      <Link href={`/lesson/${video.id}?from=${classId}`} className="flex items-center gap-3 min-w-0 flex-1">
        <PlayCircle className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
        <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">
          {video.title}
        </span>
        {statusLabel && (
          <Badge
            variant="secondary"
            className={`text-[9px] uppercase tracking-wider font-bold shrink-0 ${
              video.status === "errored" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            }`}
          >
            {statusLabel}
          </Badge>
        )}
      </Link>
      <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded bg-background shrink-0">
        {formatShortDuration(video.duration)}
      </span>
      <VideoRenameDialog videoId={video.id} classId={classId} initialTitle={video.title} />
      <UnplaceVideoButton placementId={video.placement_id} onError={onError} />
    </div>
  );
}

function SortableVideoRow({
  video,
  classId,
  subtopicId,
  onError,
}: {
  video: VideoWithProgress;
  classId: string;
  subtopicId: string;
  onError: (message: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: video.placement_id,
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
      <Link href={`/lesson/${video.id}?from=${classId}`} className="flex items-center gap-3 py-3 flex-1 min-w-0">
        <PlayCircle className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
        <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">
          {video.title}
        </span>
        {statusLabel && (
          <Badge
            variant="secondary"
            className={`text-[9px] uppercase tracking-wider font-bold shrink-0 ${
              video.status === "errored" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
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
        <UnplaceVideoButton placementId={video.placement_id} onError={onError} />
      </div>
    </div>
  );
}

function SubtopicVideoList({
  subtopic,
  classId,
  onError,
}: {
  subtopic: SubtopicWithChildren;
  classId: string;
  onError: (message: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `sub:${subtopic.id}`,
    data: { type: "subtopic", subtopicId: subtopic.id },
  });
  const placementIds = subtopic.videos.map((video) => video.placement_id);

  return (
    <div ref={setNodeRef} className={isOver ? "bg-primary/5" : ""}>
      <SortableContext items={placementIds} strategy={verticalListSortingStrategy}>
        {subtopic.videos.map((video) => (
          <SortableVideoRow
            key={video.placement_id}
            video={video}
            classId={classId}
            subtopicId={subtopic.id}
            onError={onError}
          />
        ))}
      </SortableContext>
      {subtopic.videos.length === 0 && (
        <div
          className={`m-2 flex min-h-[64px] items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center text-xs italic transition-colors ${
            isOver ? "border-primary/40 bg-primary/5 text-primary" : "border-border/50 text-muted-foreground"
          }`}
        >
          Drop a video here, or use Add videos above.
        </div>
      )}
    </div>
  );
}

function TopicSection({
  topic,
  classId,
  libraryVideos,
  libraryNotes,
  onError,
}: {
  topic: TopicWithChildren;
  classId: string;
  libraryVideos: LibraryVideo[];
  libraryNotes: LibraryNote[];
  onError: (message: string) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `topic:${topic.id}`,
    data: { type: "topic", topicId: topic.id },
  });

  return (
    <AccordionItem
      value={topic.id}
      className="bg-card rounded-xl border border-border shadow-sm overflow-hidden relative"
    >
      <div className={`absolute top-0 left-0 w-full h-1 ${topic.status === "active" ? "bg-primary" : "bg-muted"}`} />
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
              <TopicFormDialog classId={classId} mode="rename" topicId={topic.id} initialTitle={topic.title} />
              <DeleteCurriculumItemButton
                kind="topic"
                itemId={topic.id}
                classId={classId}
                name={topic.title}
                summary={`${pluralise(topic.subtopics.length, "subtopic")} and ${pluralise(topic.total_videos, "video")}`}
              />
            </div>
          </div>

          {/* Topic-level materials: an intro video, a topic-wide note, etc. */}
          <div className="p-3 bg-primary/5 border-b border-border/50 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              Topic Materials
            </span>
            <div className="flex items-center gap-1">
              <AddVideosToSubtopicDialog
                classId={classId}
                parent={{ kind: "topic", id: topic.id }}
                parentLabel={topic.title}
                libraryVideos={libraryVideos}
                placedVideoIds={topic.videos.map((video) => video.id)}
              />
              <AddNotesToParentDialog
                classId={classId}
                parent={{ kind: "topic", id: topic.id }}
                parentLabel={topic.title}
                libraryNotes={libraryNotes}
                placedNoteIds={topic.notes.map((note) => note.id)}
              />
            </div>
          </div>
          {topic.videos.length === 0 && topic.notes.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground italic border-b border-border/50">
              No topic-level materials. Use Add videos / Add notes for an intro video or a topic-wide note.
            </div>
          ) : (
            <div className="border-b border-border/50">
              {topic.videos.map((video) => (
                <TopicVideoRow key={video.placement_id} video={video} classId={classId} onError={onError} />
              ))}
              {topic.notes.map((note) => (
                <NoteRow key={note.placement_id} note={note} classId={classId} onError={onError} />
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
                  <AddNotesToParentDialog
                    classId={classId}
                    parent={{ kind: "subtopic", id: subtopic.id }}
                    parentLabel={`${topic.title} / ${subtopic.title}`}
                    libraryNotes={libraryNotes}
                    placedNoteIds={subtopic.notes.map((note) => note.id)}
                  />
                  <AddVideosToSubtopicDialog
                    classId={classId}
                    parent={{ kind: "subtopic", id: subtopic.id }}
                    parentLabel={`${topic.title} / ${subtopic.title}`}
                    libraryVideos={libraryVideos}
                    placedVideoIds={subtopic.videos.map((video) => video.id)}
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
                    summary={`${pluralise(subtopic.videos.length, "video")}, ${pluralise(subtopic.notes.length, "note")}`}
                  />
                </div>
              </div>

              {subtopic.notes.map((note) => (
                <NoteRow key={note.placement_id} note={note} classId={classId} onError={onError} />
              ))}

              <SubtopicVideoList subtopic={subtopic} classId={classId} onError={onError} />
            </div>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function EducatorCurriculumOverview({
  classId,
  curriculum,
  libraryVideos,
  libraryNotes,
}: EducatorCurriculumOverviewProps) {
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
    setActiveVideo(findByPlacement(topics, String(event.active.id)));
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
    let overPlacementId: string | null = null;
    if (overId.startsWith("sub:")) {
      targetSubtopicId = overId.slice("sub:".length);
    } else if (overId.startsWith("topic:")) {
      return;
    } else {
      if (overId === activeId) return;
      overPlacementId = overId;
      targetSubtopicId = (over.data.current?.subtopicId as string | undefined) ?? "";
    }
    if (!targetSubtopicId) return;

    if (sourceSubtopicId !== targetSubtopicId) {
      const draggedVideo = findByPlacement(topics, activeId);
      const targetSubtopic = topics
        .flatMap((topic) => topic.subtopics)
        .find((subtopic) => subtopic.id === targetSubtopicId);
      if (
        draggedVideo &&
        targetSubtopic?.videos.some(
          (video) => video.id === draggedVideo.id && video.placement_id !== activeId,
        )
      ) {
        setError("That video is already in the destination subtopic.");
        return;
      }
    }

    const result = computeReorder(topics, activeId, sourceSubtopicId, targetSubtopicId, overPlacementId);
    if (!result) return;

    setTopics(result.nextTopics);
    startTransition(async () => {
      const response = await reorderPlacedVideosAction(
        classId,
        { kind: "subtopic", id: targetSubtopicId },
        result.targetOrderedPlacementIds,
      );
      if (response?.error) {
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
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0 hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {topics.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
          <FolderTree className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold mb-1">No topics yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Use <span className="font-semibold text-foreground">Add Topic</span> above to start building this class&apos;s curriculum. Each topic holds subtopics, videos and notes.
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
          <Accordion type="multiple" value={openTopics} onValueChange={setOpenTopics} className="w-full flex flex-col gap-4">
            {topics.map((topic) => (
              <TopicSection
                key={topic.id}
                topic={topic}
                classId={classId}
                libraryVideos={libraryVideos}
                libraryNotes={libraryNotes}
                onError={setError}
              />
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
