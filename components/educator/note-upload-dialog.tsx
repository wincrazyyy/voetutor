"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createNotePresignAction,
  createNoteUploadAction,
  reapNoteObjectAction,
} from "@/app/actions/resources";
import { formatBytes } from "@/lib/utils/format";
import type { PlacementParent } from "@/lib/types/database";

const MAX_BYTES = 100 * 1024 * 1024;

interface NoteUploadDialogProps {
  /** When set, each new note is placed under this node as well as landing in the library. */
  parent?: PlacementParent | null;
  /** Shown in the dialog subtitle when a parent is given (e.g. "Calculus › Limits"). */
  parentLabel?: string;
  /** Trigger button label + look. */
  buttonLabel?: string;
  buttonVariant?: "default" | "ghost";
  buttonClassName?: string;
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Title for a note derived from its file name, clamped to the column limit. */
function deriveTitle(file: File): string {
  const base = stripExtension(file.name).trim().slice(0, 255);
  return base || file.name.slice(0, 255);
}

/**
 * Uploads one or more PDFs straight from the browser to the PRIVATE owner-keyed notes bucket
 * (class-resources/{ownerId}/{uuid}.pdf), then registers each as a library note via
 * createNoteUploadAction. The bytes never pass through the server action. Files upload
 * sequentially with live progress; a failed registration reaps its just-uploaded object so
 * storage never strands a file, and any files that fail stay selected for retry.
 *
 * A single file keeps an editable title; multiple files are each titled by their file name.
 */
export function NoteUploadDialog({
  parent = null,
  parentLabel,
  buttonLabel = "Add note",
  buttonVariant = "default",
  buttonClassName,
}: NoteUploadDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setFiles([]);
    setTitle("");
    setError(null);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openDialog = () => {
    reset();
    setOpen(true);
  };

  const closeDialog = () => {
    if (pending) return;
    setOpen(false);
  };

  /** Applies a new file set, defaulting the single-file title to its file name. */
  const applyFiles = (next: File[]) => {
    setFiles(next);
    setTitle((prev) => {
      if (next.length === 1) return prev.trim() ? prev : deriveTitle(next[0]);
      return "";
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = Array.from(event.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (selected.length === 0) return;

    const rejected: string[] = [];
    const merged = [...files];
    for (const candidate of selected) {
      const isPdf =
        candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        rejected.push(`${candidate.name} (not a PDF)`);
        continue;
      }
      if (candidate.size > MAX_BYTES) {
        rejected.push(`${candidate.name} (over 100 MB)`);
        continue;
      }
      if (merged.some((f) => f.name === candidate.name && f.size === candidate.size)) continue;
      merged.push(candidate);
    }

    applyFiles(merged);
    if (rejected.length > 0) setError(`Skipped ${rejected.join(", ")}`);
  };

  const removeFile = (index: number) => {
    applyFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (files.length === 0) {
      setError("Choose at least one PDF to upload.");
      return;
    }
    if (files.length === 1 && !title.trim()) {
      setError("A title is required.");
      return;
    }

    startTransition(async () => {
      const batch = files;
      const failed: { file: File; message: string }[] = [];
      setProgress({ done: 0, total: batch.length });

      for (let index = 0; index < batch.length; index += 1) {
        const current = batch[index];
        const noteTitle = batch.length === 1 ? title.trim() : deriveTitle(current);

        /* 1) mint a presigned R2 PUT — the server authorizes, premium-gates, and owns the key. */
        const presign = await createNotePresignAction();
        if ("error" in presign) {
          failed.push({ file: current, message: presign.error });
          setProgress({ done: index + 1, total: batch.length });
          continue;
        }

        /* 2) browser → R2 direct, bypassing the Vercel body limit (exactly like the old flow). */
        let putError: string | null = null;
        try {
          const put = await fetch(presign.putUrl, {
            method: "PUT",
            body: current,
            headers: { "Content-Type": "application/pdf" },
          });
          if (!put.ok) putError = `Upload failed (${put.status}).`;
        } catch {
          putError = "Upload failed. Check your connection and retry.";
        }
        if (putError) {
          await reapNoteObjectAction(presign.key).catch(() => undefined);
          failed.push({ file: current, message: putError });
          setProgress({ done: index + 1, total: batch.length });
          continue;
        }

        /* 3) register the library row — the action verifies the true size from R2 and reaps on any
              failure so a stranded object never survives. */
        const result = await createNoteUploadAction({
          parent,
          title: noteTitle,
          description: "",
          storagePath: presign.key,
          sizeBytes: current.size,
        });
        if (result?.error) {
          await reapNoteObjectAction(presign.key).catch(() => undefined);
          failed.push({ file: current, message: result.error });
        }
        setProgress({ done: index + 1, total: batch.length });
      }

      setProgress(null);

      if (failed.length === 0) {
        setOpen(false);
        reset();
        router.refresh();
        return;
      }

      /* Keep only the failures selected so the user can retry them; the successes are
         already saved, so refresh to reflect them behind the dialog. */
      applyFiles(failed.map((entry) => entry.file));
      const succeeded = batch.length - failed.length;
      setError(
        succeeded === 0
          ? `Upload failed: ${failed.map((entry) => `${entry.file.name} — ${entry.message}`).join("; ")}`
          : `Uploaded ${succeeded} of ${batch.length}. Still failing: ${failed
              .map((entry) => entry.file.name)
              .join(", ")}. Fix and retry.`,
      );
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button
        size={buttonVariant === "ghost" ? "sm" : "default"}
        variant={buttonVariant}
        className={buttonClassName ?? (buttonVariant === "ghost" ? "h-7 text-xs gap-1 text-primary" : "gap-2 shadow-md")}
        onClick={openDialog}
      >
        {buttonVariant === "ghost" ? <Plus className="w-3 h-3" /> : <UploadCloud className="w-4 h-4" />}
        {buttonLabel}
      </Button>
    );
  }

  const multiple = files.length > 1;
  const uploadLabel = pending
    ? progress
      ? `Uploading ${progress.done}/${progress.total}…`
      : "Uploading…"
    : multiple
      ? `Upload ${files.length} notes`
      : "Upload";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {multiple ? "Add notes" : "Add note"}
            </h2>
            {parentLabel && (
              <p className="text-sm text-muted-foreground truncate mt-1">→ {parentLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={closeDialog}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
            disabled={pending}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="note-file">PDF file{files.length === 1 ? "" : "s"}</Label>
            <input
              ref={fileInputRef}
              id="note-file"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={handleFileChange}
              disabled={pending}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20 file:cursor-pointer"
            />
            {files.length === 1 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <UploadCloud className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{files[0].name}</span>
                <span className="shrink-0">· {formatBytes(files[0].size)}</span>
              </p>
            )}
            {multiple && (
              <ul className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {files.map((f, index) => (
                  <li
                    key={`${f.name}-${f.size}-${index}`}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0 text-primary/70" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="shrink-0">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      disabled={pending}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!parent && (
              <p className="text-[11px] text-muted-foreground">
                Lands in your library. Place it into classes afterwards.
              </p>
            )}
          </div>

          {multiple ? (
            <p className="text-xs text-muted-foreground">
              Each note is titled by its file name — rename any of them afterwards.
            </p>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={255}
                placeholder="e.g. Worksheet 1"
                disabled={pending}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || files.length === 0 || (files.length === 1 && !title.trim())}>
              {uploadLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
