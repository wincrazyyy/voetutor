"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameNoteAction } from "@/app/actions/resources";

interface NoteRenameDialogProps {
  resourceId: string;
  classId: string | null;
  initialTitle: string;
}

export function NoteRenameDialog({ resourceId, classId, initialTitle }: NoteRenameDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openDialog = () => {
    setTitle(initialTitle);
    setError(null);
    setOpen(true);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await renameNoteAction(resourceId, classId, title);
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
      <Button
        size="sm"
        variant="ghost"
        className="h-10 w-10 p-0 sm:h-10 text-muted-foreground hover:text-foreground xl:h-7 xl:w-7"
        onClick={openDialog}
        aria-label="Rename note"
      >
        <Pencil className="w-3.5 h-3.5" />
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold">Rename note</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="relative shrink-0 text-muted-foreground after:absolute after:-inset-3 after:content-[''] hover:text-foreground"
            aria-label="Close"
            disabled={pending}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="note-title">Note title</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={255}
              autoFocus
              disabled={pending}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={!title.trim()} loadingText="Saving...">
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
