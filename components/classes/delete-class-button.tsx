"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteClassAction } from "@/app/actions/classes";

interface DeleteClassButtonProps {
  classId: string;
  classCode: string;
  classTitle: string;
  variant?: "destructive" | "outline" | "ghost";
  size?: "default" | "sm";
  label?: string;
}

export function DeleteClassButton({
  classId,
  classCode,
  classTitle,
  variant = "destructive",
  size = "default",
  label = "Delete Class",
}: DeleteClassButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const matches = confirmation.trim() === classCode;

  const reset = () => {
    setConfirmation("");
    setError(null);
  };

  const handleDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteClassAction(classId, confirmation);
      if (result?.error) setError(result.error);
    });
  };

  if (!open) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="gap-2"
      >
        <Trash2 className="w-4 h-4" />
        {label}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-destructive/30 bg-card shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-lg font-bold">Delete class</h2>
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
              Deleting <span className="font-semibold text-foreground">{classTitle}</span> will permanently remove all topics, subtopics, videos, announcements, forum posts, and student enrolments attached to it.
            </p>
          </div>

          <form onSubmit={handleDelete} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="delete-confirm">
                Type <span className="font-mono text-foreground">{classCode}</span> to confirm:
              </Label>
              <Input
                id="delete-confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                autoFocus
                disabled={pending}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" loading={pending} disabled={!matches} loadingText="Deleting...">
                I understand, delete this class
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
