"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { createNoteUploadAction } from "@/app/actions/resources";
import { formatBytes } from "@/lib/utils/format";
import type { PlacementParent } from "@/lib/types/database";

const BUCKET = "class-resources";
const MAX_BYTES = 50 * 1024 * 1024;

interface NoteUploadDialogProps {
  /** When set, the new note is placed under this node as well as landing in the library. */
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

/**
 * Uploads a PDF straight from the browser to the PRIVATE owner-keyed notes bucket
 * (class-resources/{ownerId}/{uuid}.pdf), then registers the library note via
 * createNoteUploadAction. The bytes never pass through the server action. A failed
 * registration reaps the just-uploaded object so storage never strands a file.
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
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setFile(null);
    setTitle("");
    setError(null);
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }
    const isPdf = selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setFile(null);
      setError("Only PDF files are supported.");
      return;
    }
    if (selected.size > MAX_BYTES) {
      setFile(null);
      setError("File must be 50 MB or smaller.");
      return;
    }
    setFile(selected);
    if (!title.trim()) setTitle(stripExtension(selected.name));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose a PDF to upload.");
      return;
    }
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("A title is required.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Your session expired. Please sign in again.");
        return;
      }
      const path = `${user.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const result = await createNoteUploadAction({
        parent,
        title: cleanTitle,
        description: "",
        storagePath: path,
        sizeBytes: file.size,
      });
      if (result?.error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        setError(result.error);
        return;
      }

      setOpen(false);
      reset();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Add note
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
            <Label htmlFor="note-file">PDF file</Label>
            <input
              ref={fileInputRef}
              id="note-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              disabled={pending}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20 file:cursor-pointer"
            />
            {file && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <UploadCloud className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0">· {formatBytes(file.size)}</span>
              </p>
            )}
            {!parent && (
              <p className="text-[11px] text-muted-foreground">
                Lands in your library. Place it into classes afterwards.
              </p>
            )}
          </div>

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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !file || !title.trim()}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
