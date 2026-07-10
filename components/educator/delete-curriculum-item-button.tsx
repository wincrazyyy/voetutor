"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteSubtopicAction, deleteTopicAction } from "@/app/actions/curriculum";

interface DeleteCurriculumItemButtonProps {
  kind: "topic" | "subtopic";
  itemId: string;
  classId: string;
  name: string;
  /** Human-readable summary of what cascades, e.g. "2 subtopics and 5 videos". */
  summary?: string;
}

export function DeleteCurriculumItemButton({
  kind,
  itemId,
  classId,
  name,
  summary,
}: DeleteCurriculumItemButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result =
        kind === "topic"
          ? await deleteTopicAction(itemId, classId)
          : await deleteSubtopicAction(itemId, classId);
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
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label={`Delete ${kind}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-destructive/30 bg-card shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-lg font-bold capitalize">Delete {kind}</h2>
          </div>
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

        <div className="space-y-4">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-semibold text-destructive mb-1">This action cannot be undone.</p>
            <p className="text-muted-foreground">
              Deleting <span className="font-semibold text-foreground">{name}</span>
              {summary
                ? ` will permanently remove ${summary}, including the underlying video files.`
                : " will permanently remove it."}
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              loading={pending}
              loadingText="Deleting..."
            >
              {`Delete ${kind}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
