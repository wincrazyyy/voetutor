"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { addNotesToParentAction } from "@/app/actions/resources";
import { formatBytes } from "@/lib/utils/format";
import type { PlacementParent } from "@/lib/types/database";
import type { LibraryNote } from "@/lib/queries/note-library";
import { NoteUploadDialog } from "@/components/educator/note-upload-dialog";

interface AddNotesToParentDialogProps {
  classId: string;
  parent: PlacementParent;
  parentLabel: string;
  libraryNotes: LibraryNote[];
  placedNoteIds: string[];
}

/**
 * Board picker that places existing LIBRARY notes into a topic/subtopic (multi-select), plus an
 * "upload a new note here" call to action. Mirrors the video add dialog.
 */
export function AddNotesToParentDialog({
  classId,
  parent,
  parentLabel,
  libraryNotes,
  placedNoteIds,
}: AddNotesToParentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const placed = new Set(placedNoteIds);
  const available = libraryNotes.filter((note) => !placed.has(note.id));
  const needle = query.trim().toLowerCase();
  const filtered = needle ? available.filter((note) => note.title.toLowerCase().includes(needle)) : available;

  const openDialog = () => {
    setSelected(new Set());
    setQuery("");
    setError(null);
    setOpen(true);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    setError(null);
    if (selected.size === 0) {
      setError("Select at least one note.");
      return;
    }
    startTransition(async () => {
      const result = await addNotesToParentAction(classId, parent, [...selected]);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="h-10 text-xs gap-1 sm:h-10 xl:h-7" onClick={openDialog}>
        <Plus className="w-3 h-3" />
        Add notes
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary shrink-0" />
              Add notes
            </h2>
            <p className="text-sm text-muted-foreground truncate mt-1">{parentLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="relative text-muted-foreground hover:text-foreground shrink-0 after:absolute after:-inset-3 after:content-[''] sm:after:hidden"
            aria-label="Close"
            disabled={pending}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Add from your library
          </span>
          <NoteUploadDialog
            parent={parent}
            parentLabel={parentLabel}
            buttonLabel="Upload new"
            buttonVariant="ghost"
            onUploaded={() => setOpen(false)}
          />
        </div>

        {available.length > 0 && (
          <div className="px-6 pt-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              placeholder="Search your notes…"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              className="h-9"
              disabled={pending}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-3 min-h-0">
          {libraryNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Your notes library is empty — upload a PDF to get started.
            </p>
          ) : available.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">All your notes are already here.</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No notes match your search.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map((note) => {
                const checked = selected.has(note.id);
                return (
                  <label
                    key={note.id}
                    className={`flex min-h-11 items-center gap-3 rounded-md px-2 py-2 cursor-pointer transition-colors sm:min-h-0 ${
                      checked ? "bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(note.id)} disabled={pending} />
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate flex-1 min-w-0">{note.title}</span>
                    <span className="text-xs sm:text-[10px] text-muted-foreground shrink-0">
                      {formatBytes(note.size_bytes)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="px-6 text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2 p-6 pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              loading={pending}
              disabled={selected.size === 0}
              loadingText="Adding…"
            >
              {`Add${selected.size > 0 ? ` ${selected.size}` : ""}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
