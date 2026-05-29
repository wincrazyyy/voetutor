"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSubtopicAction, renameSubtopicAction } from "@/app/actions/curriculum";

interface SubtopicFormDialogProps {
  topicId: string;
  classId: string;
  mode: "create" | "rename";
  subtopicId?: string;
  initialTitle?: string;
}

export function SubtopicFormDialog({
  topicId,
  classId,
  mode,
  subtopicId,
  initialTitle = "",
}: SubtopicFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createSubtopicAction(topicId, classId, title)
          : await renameSubtopicAction(subtopicId ?? "", classId, title);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (mode === "create") setTitle("");
      router.refresh();
    });
  };

  const openDialog = () => {
    setTitle(initialTitle);
    setError(null);
    setOpen(true);
  };

  if (!open) {
    return mode === "create" ? (
      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={openDialog}>
        <Plus className="w-3 h-3" />
        Add Subtopic
      </Button>
    ) : (
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        onClick={openDialog}
        aria-label="Rename subtopic"
      >
        <Pencil className="w-3.5 h-3.5" />
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold">
            {mode === "create" ? "Add subtopic" : "Rename subtopic"}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
            disabled={pending}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="subtopic-title">Subtopic title</Label>
            <Input
              id="subtopic-title"
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
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending ? "Saving..." : mode === "create" ? "Add subtopic" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
