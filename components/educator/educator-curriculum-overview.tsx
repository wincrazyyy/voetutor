"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Clock,
  FileText,
  FolderTree,
  GripVertical,
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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Accordion as AccordionPrimitive } from "radix-ui";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  CurriculumItem,
  NoteWithPlacement,
  SubtopicWithChildren,
  TopicWithChildren,
  VideoWithProgress,
} from "@/lib/queries/curriculum";
import type { LibraryVideo } from "@/lib/queries/video-library";
import type { LibraryNote } from "@/lib/queries/note-library";
import type { VideoStatus } from "@/lib/types/database";
import { formatBytes, formatShortDuration } from "@/lib/utils/format";
import {
  reorderNodeContentAction,
  reorderSubtopicsAction,
  reorderTopicsAction,
} from "@/app/actions/curriculum";
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

type Kind = "topic" | "subtopic" | "video" | "note";
type PlacementNode = { kind: "topic" | "subtopic"; id: string };

/* dnd id prefixes — the kind is decodable from the id (for collision gating); structured data on each
   draggable/droppable carries the rest. Zones (SZ subtopics, CZ mixed content) catch drops onto empty
   lists. Videos and notes share one interleaved content list per node, so both use the CZ zone. */
const TID = "T#";
const SID = "S#";
const SZONE = "SZ#";
const VID = "V#";
const NID = "N#";
const CZONE = "CZ#";
/** Per-topic header droppable — present even when the topic is collapsed; hovering it during a content/
 *  subtopic drag opens the topic so its inner drop zones mount. Lowest collision priority. */
const OPEN = "OPEN#";

function nodeKey(node: PlacementNode): string {
  return `${node.kind === "topic" ? "topic" : "sub"}:${node.id}`;
}

function videoStatusLabel(status: VideoStatus): string | null {
  if (status === "ready") return null;
  if (status === "errored") return "Failed";
  return "Processing";
}

function pluralise(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function isRowId(id: string): boolean {
  return id.startsWith(TID) || id.startsWith(SID) || id.startsWith(VID) || id.startsWith(NID);
}

function isRealZoneId(id: string): boolean {
  return id.startsWith(SZONE) || id.startsWith(CZONE);
}

function idAcceptsKind(id: string, kind: Kind): boolean {
  if (kind === "topic") return id.startsWith(TID);
  if (kind === "subtopic") return id.startsWith(SID) || id.startsWith(SZONE) || id.startsWith(OPEN);
  /* video | note — content interleaves, so either lands on any content row, the content zone, or a topic
     header to open it. */
  return id.startsWith(VID) || id.startsWith(NID) || id.startsWith(CZONE) || id.startsWith(OPEN);
}

/* Only let a dragged item land on droppables of its own kind. Priority: a row, then a real list zone, then
   a topic open-zone (so hovering a collapsed topic opens it but never steals a real drop). */
const detectCollisions: CollisionDetection = (args) => {
  const kind = args.active.data.current?.type as Kind | undefined;
  if (!kind) return [];
  const pointer = pointerWithin(args);
  const base = pointer.length > 0 ? pointer : rectIntersection(args);
  const matches = base.filter((c) => idAcceptsKind(String(c.id), kind));
  const row = matches.find((c) => isRowId(String(c.id)));
  if (row) return [row];
  const zone = matches.find((c) => isRealZoneId(String(c.id)));
  if (zone) return [zone];
  const open = matches.find((c) => String(c.id).startsWith(OPEN));
  if (open) return [open];
  return matches.length > 0 ? [matches[0]] : [];
};

/* ----- lookups + immutable reducers over the topics tree ----- */

function cloneTopics(topics: TopicWithChildren[]): TopicWithChildren[] {
  return topics.map((t) => ({
    ...t,
    videos: [...t.videos],
    notes: [...t.notes],
    items: [...t.items],
    subtopics: t.subtopics.map((s) => ({ ...s, videos: [...s.videos], notes: [...s.notes], items: [...s.items] })),
  }));
}

function nodeItemList(topics: TopicWithChildren[], node: PlacementNode): CurriculumItem[] | null {
  if (node.kind === "topic") return topics.find((t) => t.id === node.id)?.items ?? null;
  for (const t of topics) {
    const s = t.subtopics.find((sub) => sub.id === node.id);
    if (s) return s.items;
  }
  return null;
}

/** Re-derive each node's videos[]/notes[] from its (mutated) items[] so the counts, empty-state checks
 *  and Add-dialog "already placed" ids stay consistent during the optimistic window before refresh. */
function syncNodeArrays(topics: TopicWithChildren[]): void {
  const apply = (node: { items: CurriculumItem[]; videos: VideoWithProgress[]; notes: NoteWithPlacement[] }) => {
    node.videos = node.items.filter((i): i is Extract<CurriculumItem, { kind: "video" }> => i.kind === "video");
    node.notes = node.items.filter((i): i is Extract<CurriculumItem, { kind: "note" }> => i.kind === "note");
  };
  for (const t of topics) {
    apply(t);
    t.subtopics.forEach(apply);
  }
}

function lookupTitle(topics: TopicWithChildren[], kind: Kind, rawId: string): string {
  if (kind === "topic") return topics.find((t) => t.id === rawId)?.title ?? "Topic";
  if (kind === "subtopic") {
    for (const t of topics) {
      const s = t.subtopics.find((sub) => sub.id === rawId);
      if (s) return s.title;
    }
    return "Subtopic";
  }
  for (const t of topics) {
    const v = t.videos.find((x) => x.placement_id === rawId) ?? t.notes.find((x) => x.placement_id === rawId);
    if (v) return v.title;
    for (const s of t.subtopics) {
      const sv = s.videos.find((x) => x.placement_id === rawId) ?? s.notes.find((x) => x.placement_id === rawId);
      if (sv) return sv.title;
    }
  }
  return kind === "video" ? "Video" : "Note";
}

interface MoveContentResult {
  nextTopics: TopicWithChildren[];
  orderedItems: Array<{ kind: "video" | "note"; placementId: string }>;
}

/**
 * Reorder/move a piece of content across the node's MERGED items list (videos + notes interleaved), so a
 * video can land between two notes and vice-versa. Same-node = arrayMove on the original indices; cross-node
 * = splice with a duplicate guard (backed by the partial unique indexes). Emits the destination node's full
 * ordered membership as {kind, placementId}[] for reorderNodeContentAction.
 */
function moveContent(
  topics: TopicWithChildren[],
  activePlacementId: string,
  targetNode: PlacementNode,
  overPlacementId: string | null,
): MoveContentResult | "duplicate" | null {
  const next = cloneTopics(topics);
  const target = nodeItemList(next, targetNode);
  if (!target) return null;

  /* Find the list + index that currently holds the dragged placement. */
  let source: CurriculumItem[] | null = null;
  let moved: CurriculumItem | null = null;
  let activeIndex = -1;
  for (const t of next) {
    const lists: CurriculumItem[][] = [t.items, ...t.subtopics.map((s) => s.items)];
    for (const list of lists) {
      const idx = list.findIndex((item) => item.placement_id === activePlacementId);
      if (idx !== -1) {
        source = list;
        moved = list[idx];
        activeIndex = idx;
        break;
      }
    }
    if (source) break;
  }
  if (!source || !moved) return null;

  if (source === target) {
    /* Same node: arrayMove on the ORIGINAL indices so dragging down lands *after* the target (not before). */
    let to = target.length - 1;
    if (overPlacementId) {
      const oi = target.findIndex((item) => item.placement_id === overPlacementId);
      if (oi !== -1) to = oi;
    }
    if (to === activeIndex) return null;
    const reordered = arrayMove(target, activeIndex, to);
    target.splice(0, target.length, ...reordered);
  } else {
    /* Cross-node move. Guard against the same underlying video/note already living in the target. */
    if (target.some((item) => item.id === moved!.id)) return "duplicate";
    source.splice(activeIndex, 1);
    let insertIndex = target.length;
    if (overPlacementId) {
      const oi = target.findIndex((item) => item.placement_id === overPlacementId);
      if (oi !== -1) insertIndex = oi;
    }
    target.splice(insertIndex, 0, moved);
  }

  syncNodeArrays(next);
  return {
    nextTopics: next,
    orderedItems: target.map((item) => ({ kind: item.kind, placementId: item.placement_id })),
  };
}

function moveSubtopic(
  topics: TopicWithChildren[],
  activeSubId: string,
  targetTopicId: string,
  overSubId: string | null,
): { nextTopics: TopicWithChildren[]; orderedSubIds: string[] } | null {
  const next = topics.map((t) => ({ ...t, subtopics: [...t.subtopics] }));
  const target = next.find((t) => t.id === targetTopicId);
  if (!target) return null;

  let source: SubtopicWithChildren[] | null = null;
  let moved: SubtopicWithChildren | null = null;
  let activeIndex = -1;
  for (const t of next) {
    const idx = t.subtopics.findIndex((s) => s.id === activeSubId);
    if (idx !== -1) {
      source = t.subtopics;
      moved = t.subtopics[idx];
      activeIndex = idx;
      break;
    }
  }
  if (!source || !moved) return null;

  if (source === target.subtopics) {
    /* Reorder within a topic — arrayMove on original indices (correct in both directions). */
    let to = target.subtopics.length - 1;
    if (overSubId) {
      const oi = target.subtopics.findIndex((s) => s.id === overSubId);
      if (oi !== -1) to = oi;
    }
    if (to === activeIndex) return null;
    const reordered = arrayMove(target.subtopics, activeIndex, to);
    target.subtopics.splice(0, target.subtopics.length, ...reordered);
    return { nextTopics: next, orderedSubIds: target.subtopics.map((s) => s.id) };
  }

  /* Reparent into another topic. */
  source.splice(activeIndex, 1);
  let insertIndex = target.subtopics.length;
  if (overSubId) {
    const oi = target.subtopics.findIndex((s) => s.id === overSubId);
    if (oi !== -1) insertIndex = oi;
  }
  target.subtopics.splice(insertIndex, 0, moved);
  return { nextTopics: next, orderedSubIds: target.subtopics.map((s) => s.id) };
}

/* ----- draggable rows ----- */

function DragHandle({ listeners, attributes, label }: { listeners: ReturnType<typeof useSortable>["listeners"]; attributes: ReturnType<typeof useSortable>["attributes"]; label: string }) {
  return (
    <button
      type="button"
      className="relative text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0 after:absolute after:-inset-3 after:content-[''] xl:after:hidden"
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );
}

function SortableVideoRow({
  video,
  classId,
  node,
  onError,
}: {
  video: VideoWithProgress;
  classId: string;
  node: PlacementNode;
  onError: (message: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${VID}${video.placement_id}`,
    data: { type: "video", node },
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
      <div className="pl-3 pr-1 py-3">
        <DragHandle listeners={listeners} attributes={attributes} label="Drag to reorder or move this video" />
      </div>
      <Link href={`/lesson/${video.id}?from=${classId}`} className="flex items-center gap-3 py-3 flex-1 min-w-0">
        <PlayCircle className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
        <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">{video.title}</span>
        {statusLabel && (
          <Badge
            variant="secondary"
            className={`text-[11px] sm:text-[9px] uppercase tracking-wider font-bold shrink-0 ${
              video.status === "errored" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            }`}
          >
            {statusLabel}
          </Badge>
        )}
      </Link>
      <div className="flex items-center gap-1 shrink-0 pr-2">
        <span className="text-xs sm:text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded bg-background">
          {formatShortDuration(video.duration)}
        </span>
        <VideoRenameDialog videoId={video.id} classId={classId} initialTitle={video.title} />
        <UnplaceVideoButton placementId={video.placement_id} onError={onError} />
      </div>
    </div>
  );
}

function SortableNoteRow({
  note,
  classId,
  node,
  onError,
}: {
  note: NoteWithPlacement;
  classId: string;
  node: PlacementNode;
  onError: (message: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${NID}${note.placement_id}`,
    data: { type: "note", node },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 border-b border-border/50 last:border-0 bg-muted/5 hover:bg-muted/50 transition-colors ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="pl-3 pr-1 py-3">
        <DragHandle listeners={listeners} attributes={attributes} label="Drag to reorder or move this note" />
      </div>
      <a
        href={`/api/resources/${note.id}/download`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 py-3 min-w-0 flex-1 hover:text-foreground transition-colors"
      >
        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-muted-foreground truncate">{note.title}</span>
      </a>
      <div className="flex items-center gap-1 shrink-0 pr-2">
        <span className="text-xs sm:text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded bg-background">
          {formatBytes(note.size_bytes)}
        </span>
        <NoteRenameDialog resourceId={note.id} classId={classId} initialTitle={note.title} />
        <UnplaceNoteButton placementId={note.placement_id} onError={onError} />
      </div>
    </div>
  );
}

/* A node's content — videos and notes interleaved in one shared order, one sortable list, one drop zone. */
function ContentArea({
  node,
  items,
  classId,
  activeKind,
  onError,
}: {
  node: PlacementNode;
  items: CurriculumItem[];
  classId: string;
  activeKind: Kind | null;
  onError: (message: string) => void;
}) {
  const key = nodeKey(node);
  const zone = useDroppable({ id: `${CZONE}${key}`, data: { type: "content", node } });
  const isContentDrag = activeKind === "video" || activeKind === "note";

  return (
    <div
      ref={zone.setNodeRef}
      className={`transition-colors ${
        isContentDrag
          ? `outline-dashed outline-1 outline-offset-[-2px] ${zone.isOver ? "bg-primary/10 outline-primary/60" : "outline-primary/25"}`
          : ""
      }`}
    >
      <SortableContext
        items={items.map((item) => `${item.kind === "video" ? VID : NID}${item.placement_id}`)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item) =>
          item.kind === "video" ? (
            <SortableVideoRow key={item.placement_id} video={item} classId={classId} node={node} onError={onError} />
          ) : (
            <SortableNoteRow key={item.placement_id} note={item} classId={classId} node={node} onError={onError} />
          ),
        )}
      </SortableContext>
      {items.length === 0 && isContentDrag && (
        <div
          className={`m-2 flex min-h-[48px] items-center justify-center rounded-md border-2 border-dashed px-4 py-4 text-center text-xs italic transition-colors ${
            zone.isOver ? "border-primary/40 bg-primary/5 text-primary" : "border-border/50 text-muted-foreground"
          }`}
        >
          Drop content here
        </div>
      )}
    </div>
  );
}

function SortableSubtopic({
  subtopic,
  topic,
  classId,
  libraryVideos,
  libraryNotes,
  activeKind,
  onError,
}: {
  subtopic: SubtopicWithChildren;
  topic: TopicWithChildren;
  classId: string;
  libraryVideos: LibraryVideo[];
  libraryNotes: LibraryNote[];
  activeKind: Kind | null;
  onError: (message: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${SID}${subtopic.id}`,
    data: { type: "subtopic", topicId: topic.id },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={`border-b border-border/50 last:border-0 ${isDragging ? "opacity-40" : ""}`}>
      <div className="bg-muted/20 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 sm:flex-nowrap">
        <div className="flex basis-full items-center gap-2 min-w-0 sm:basis-auto">
          <DragHandle listeners={listeners} attributes={attributes} label="Drag to reorder or move this subtopic" />
          <span className="text-xs sm:text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
            {subtopic.title}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 sm:flex-nowrap sm:shrink-0">
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
            onError={onError}
          />
        </div>
      </div>

      <ContentArea
        node={{ kind: "subtopic", id: subtopic.id }}
        items={subtopic.items}
        classId={classId}
        activeKind={activeKind}
        onError={onError}
      />
    </div>
  );
}

function SortableTopic({
  topic,
  classId,
  libraryVideos,
  libraryNotes,
  activeKind,
  onError,
  isOpen,
  onToggle,
}: {
  topic: TopicWithChildren;
  classId: string;
  libraryVideos: LibraryVideo[];
  libraryNotes: LibraryNote[];
  activeKind: Kind | null;
  onError: (message: string) => void;
  isOpen: boolean;
  onToggle: (topicId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${TID}${topic.id}`,
    data: { type: "topic" },
  });
  const subZone = useDroppable({ id: `${SZONE}${topic.id}`, data: { type: "subtopic", topicId: topic.id } });
  const openZone = useDroppable({ id: `${OPEN}${topic.id}`, data: { type: "topicopen", topicId: topic.id } });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <AccordionItem
      ref={setNodeRef}
      style={style}
      value={topic.id}
      className={`bg-card rounded-xl border border-border shadow-sm overflow-hidden relative [&[data-state=open]_.topic-bar]:bg-muted/40 [&[data-state=open]_.topic-chevron]:rotate-180 ${isDragging ? "opacity-50" : ""}`}
    >
      <div ref={openZone.setNodeRef} className="topic-bar flex items-stretch bg-muted/10 hover:bg-muted/40 transition-colors">
        <button
          type="button"
          className="flex min-w-11 items-center pl-3 pr-1 text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0 xl:min-w-0"
          aria-label="Drag to reorder this topic"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <AccordionPrimitive.Trigger className="flex flex-1 min-w-0 items-center gap-4 p-4 pl-2 text-left outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:p-5 sm:pl-2">
          <div className="flex flex-col gap-2.5 min-w-0">
            <span className="text-base font-bold leading-tight break-words">{topic.title}</span>
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
        </AccordionPrimitive.Trigger>
        <div className="flex items-center gap-0.5 pr-2 pl-0 shrink-0 sm:gap-1 sm:pr-4 sm:pl-1">
          <TopicFormDialog classId={classId} mode="rename" topicId={topic.id} initialTitle={topic.title} />
          <DeleteCurriculumItemButton
            kind="topic"
            itemId={topic.id}
            classId={classId}
            name={topic.title}
            summary={`${pluralise(topic.subtopics.length, "subtopic")} and ${pluralise(topic.total_videos, "video")}`}
            onError={onError}
          />
          <button
            type="button"
            onClick={() => onToggle(topic.id)}
            aria-label={isOpen ? "Collapse topic" : "Expand topic"}
            className="relative flex h-10 w-10 items-center justify-center text-muted-foreground xl:h-4 xl:w-4"
          >
            <ChevronDown className="topic-chevron w-4 h-4 transition-transform duration-200" />
          </button>
        </div>
      </div>

      <AccordionContent className="p-0 border-t border-border">
        <div className="flex flex-col">
          <div className="p-3 bg-muted/20 border-b border-border/50 flex items-center gap-2">
            <SubtopicFormDialog topicId={topic.id} classId={classId} mode="create" />
          </div>

          {/* Topic-level materials: an intro video, a topic-wide note, etc. */}
          <div className="p-3 bg-primary/5 border-b border-border/50 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs sm:text-[10px] font-bold uppercase tracking-widest text-primary">Topic Materials</span>
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
          {topic.items.length === 0 && activeKind !== "video" && activeKind !== "note" ? (
            <div className="px-4 py-3 text-xs text-muted-foreground italic border-b border-border/50">
              No topic-level materials. Use Add videos / Add notes, or drag one here.
            </div>
          ) : (
            <div className="border-b border-border/50">
              <ContentArea
                node={{ kind: "topic", id: topic.id }}
                items={topic.items}
                classId={classId}
                activeKind={activeKind}
                onError={onError}
              />
            </div>
          )}

          <div
            ref={subZone.setNodeRef}
            className={`transition-colors ${
              activeKind === "subtopic"
                ? `outline-dashed outline-1 outline-offset-[-2px] ${subZone.isOver ? "bg-primary/10 outline-primary/60" : "outline-primary/25"}`
                : ""
            }`}
          >
            <SortableContext
              items={topic.subtopics.map((s) => `${SID}${s.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {topic.subtopics.map((subtopic) => (
                <SortableSubtopic
                  key={subtopic.id}
                  subtopic={subtopic}
                  topic={topic}
                  classId={classId}
                  libraryVideos={libraryVideos}
                  libraryNotes={libraryNotes}
                  activeKind={activeKind}
                  onError={onError}
                />
              ))}
            </SortableContext>
            {topic.subtopics.length === 0 && activeKind === "subtopic" && (
              <div
                className={`m-2 flex min-h-[48px] items-center justify-center rounded-md border-2 border-dashed px-4 py-4 text-center text-xs italic transition-colors ${
                  subZone.isOver ? "border-primary/40 bg-primary/5 text-primary" : "border-border/50 text-muted-foreground"
                }`}
              >
                Drop a subtopic here
              </div>
            )}
          </div>
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
  const [activeDrag, setActiveDrag] = useState<{ kind: Kind; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setTopics(curriculum);
  }, [curriculum]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const runReorder = (action: () => Promise<{ error?: string } | undefined>) => {
    startTransition(async () => {
      const res = await action();
      if (res?.error) {
        setTopics(curriculum);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setError(null);
    const kind = event.active.data.current?.type as Kind | undefined;
    if (!kind) return;
    const id = String(event.active.id);
    const rawId = id.slice(id.indexOf("#") + 1);
    setActiveDrag({ kind, title: lookupTitle(topics, kind, rawId) });
  };

  /* Open a collapsed topic when a content/subtopic drag hovers its header, so its drop zones mount. One
     topic at a time (not all) to avoid a jarring page shift mid-drag. */
  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    if (overId?.startsWith(OPEN)) {
      const topicId = overId.slice(OPEN.length);
      setOpenTopics((prev) => (prev.includes(topicId) ? prev : [...prev, topicId]));
    }
  };

  const handleDragCancel = () => setActiveDrag(null);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const kind = active.data.current?.type as Kind | undefined;
    if (!kind) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (kind === "topic") {
      if (!overId.startsWith(TID) || overId === activeId) return;
      const activeTopicId = activeId.slice(TID.length);
      const overTopicId = overId.slice(TID.length);
      const from = topics.findIndex((t) => t.id === activeTopicId);
      const to = topics.findIndex((t) => t.id === overTopicId);
      if (from === -1 || to === -1) return;
      const next = arrayMove(topics, from, to);
      setTopics(next);
      runReorder(() => reorderTopicsAction(classId, next.map((t) => t.id)));
      return;
    }

    if (kind === "subtopic") {
      const activeSubId = activeId.slice(SID.length);
      let targetTopicId: string;
      let overSubId: string | null = null;
      if (overId.startsWith(SZONE)) {
        targetTopicId = (over.data.current?.topicId as string | undefined) ?? overId.slice(SZONE.length);
      } else if (overId.startsWith(OPEN)) {
        targetTopicId = (over.data.current?.topicId as string | undefined) ?? overId.slice(OPEN.length);
      } else if (overId.startsWith(SID)) {
        if (overId === activeId) return;
        overSubId = overId.slice(SID.length);
        targetTopicId = (over.data.current?.topicId as string | undefined) ?? "";
      } else {
        return;
      }
      if (!targetTopicId) return;
      const result = moveSubtopic(topics, activeSubId, targetTopicId, overSubId);
      if (!result) return;
      setTopics(result.nextTopics);
      runReorder(() => reorderSubtopicsAction(classId, targetTopicId, result.orderedSubIds));
      return;
    }

    /* video | note — content interleaves, so the active kind (from its id prefix) only decides messaging;
       the merged reducer + single reorderNodeContentAction handle either landing on either. */
    const activePlacementId = activeId.slice(activeId.indexOf("#") + 1);
    let targetNode: PlacementNode | undefined;
    let overPlacementId: string | null = null;
    if (overId.startsWith(OPEN)) {
      /* Dropped on a topic header → topic-level materials of that topic. */
      const topicId = (over.data.current?.topicId as string | undefined) ?? overId.slice(OPEN.length);
      targetNode = { kind: "topic", id: topicId };
    } else {
      targetNode = over.data.current?.node as PlacementNode | undefined;
      if (overId.startsWith(VID) || overId.startsWith(NID)) {
        if (overId === activeId) return;
        overPlacementId = overId.slice(overId.indexOf("#") + 1);
      }
    }
    if (!targetNode) return;
    const result = moveContent(topics, activePlacementId, targetNode, overPlacementId);
    if (result === "duplicate") {
      setError(`That ${kind} is already in the destination node.`);
      return;
    }
    if (!result) return;
    setTopics(result.nextTopics);
    runReorder(() => reorderNodeContentAction(classId, targetNode, result.orderedItems));
  };

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
          <span className="min-w-0 break-words">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="relative shrink-0 hover:opacity-70 after:absolute after:-inset-3 after:content-[''] sm:after:hidden">
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
          id="curriculum-board"
          sensors={sensors}
          collisionDetection={detectCollisions}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <Accordion type="multiple" value={openTopics} onValueChange={setOpenTopics} className="w-full flex flex-col gap-4">
            <SortableContext items={topics.map((t) => `${TID}${t.id}`)} strategy={verticalListSortingStrategy}>
              {topics.map((topic) => (
                <SortableTopic
                  key={topic.id}
                  topic={topic}
                  classId={classId}
                  libraryVideos={libraryVideos}
                  libraryNotes={libraryNotes}
                  activeKind={activeDrag?.kind ?? null}
                  onError={setError}
                  isOpen={openTopics.includes(topic.id)}
                  onToggle={(id) =>
                    setOpenTopics((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                  }
                />
              ))}
            </SortableContext>
          </Accordion>
          <DragOverlay>
            {activeDrag ? (
              <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-card shadow-lg px-4 py-3">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                {activeDrag.kind === "video" && <PlayCircle className="w-4 h-4 text-primary shrink-0" />}
                {activeDrag.kind === "note" && <FileText className="w-4 h-4 text-primary shrink-0" />}
                {activeDrag.kind === "topic" && <FolderTree className="w-4 h-4 text-primary shrink-0" />}
                {activeDrag.kind === "subtopic" && <FolderTree className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className="text-sm font-medium truncate max-w-[60vw] sm:max-w-xs">{activeDrag.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
