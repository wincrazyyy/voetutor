"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NoteRenameDialog } from "@/components/educator/note-rename-dialog";
import { NoteAssignDialog } from "@/components/educator/note-assign-dialog";
import { deleteNoteAction } from "@/app/actions/resources";
import { formatBytes } from "@/lib/utils/format";
import type { LibraryNote } from "@/lib/queries/note-library";
import type { PlacementTreeClass } from "@/lib/queries/video-library";

interface NoteLibraryListProps {
  notes: LibraryNote[];
  tree: PlacementTreeClass[];
}

function LibraryNoteCard({ note, tree }: { note: LibraryNote; tree: PlacementTreeClass[] }) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const classCount = new Set(note.placements.map((placement) => placement.class_id)).size;

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteNoteAction(note.id);
      if (result?.error) {
        setError(result.error);
        setConfirmingDelete(false);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card className="flex gap-4 p-4 border-border bg-card shadow-sm">
      <div className="w-12 h-12 rounded-md bg-primary/10 shrink-0 flex items-center justify-center">
        <FileText className="w-6 h-6 text-primary" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <a
              href={`/api/resources/${note.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold truncate hover:text-primary transition-colors block"
            >
              {note.title}
            </a>
            <span className="text-[11px] text-muted-foreground">{formatBytes(note.size_bytes)} · PDF</span>
          </div>
          <NoteRenameDialog resourceId={note.id} classId={null} initialTitle={note.title} />
        </div>

        {note.placements.length === 0 ? (
          <span className="inline-flex w-fit items-center text-[11px] italic rounded-full border border-dashed border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
            Not in any class yet
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {note.placements.map((placement) => (
              <span
                key={placement.placement_id}
                className="inline-flex items-center gap-1 text-[11px] rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground"
                title={
                  placement.subtopic_title
                    ? `${placement.class_title} → ${placement.topic_title} → ${placement.subtopic_title}`
                    : `${placement.class_title} → ${placement.topic_title} (topic-level)`
                }
              >
                <span className="font-medium text-foreground truncate max-w-[10rem]">
                  {placement.class_title}
                </span>
                <span className="opacity-60">·</span>
                <span className="truncate max-w-[10rem]">
                  {placement.subtopic_title ?? placement.topic_title}
                </span>
              </span>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center gap-2 mt-auto pt-1">
          <NoteAssignDialog
            resourceId={note.id}
            noteTitle={note.title}
            currentParents={note.placements.map((placement) =>
              placement.parent_kind === "topic"
                ? { kind: "topic" as const, id: placement.topic_id }
                : { kind: "subtopic" as const, id: placement.subtopic_id! },
            )}
            tree={tree}
          />
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {classCount === 0
                  ? "Delete this note permanently?"
                  : `Delete from ${classCount} class${classCount === 1 ? "" : "es"}?`}
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={handleDelete}
                disabled={pending}
              >
                {pending ? "Deleting..." : "Delete"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * The educator's notes (PDF) library: every owned note with its placement chips, inline rename, the
 * assign-to-classes picker (overlap), and library deletion. Mirrors VideoLibraryList.
 */
export function NoteLibraryList({ notes, tree }: NoteLibraryListProps) {
  const [query, setQuery] = useState("");

  if (notes.length === 0) {
    return (
      <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
        <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <h3 className="text-lg font-bold mb-1">No notes yet</h3>
        <p className="text-sm text-muted-foreground">
          Upload your first PDF note — it lands here, then you place it into your classes.
        </p>
      </Card>
    );
  }

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? notes.filter(
        (note) =>
          note.title.toLowerCase().includes(needle) ||
          note.placements.some(
            (placement) =>
              placement.class_title.toLowerCase().includes(needle) ||
              placement.topic_title.toLowerCase().includes(needle) ||
              (placement.subtopic_title ?? "").toLowerCase().includes(needle),
          ),
      )
    : notes;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes by title or class…"
          className="w-full pl-9"
          aria-label="Search notes"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
          <Search className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No notes match your search.</p>
        </Card>
      ) : (
        filtered.map((note) => <LibraryNoteCard key={note.id} note={note} tree={tree} />)
      )}
    </div>
  );
}
