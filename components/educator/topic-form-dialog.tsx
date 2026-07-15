"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTopicAction, renameTopicAction } from "@/app/actions/curriculum";

interface TopicFormDialogProps {
  classId: string;
  mode: "create" | "rename";
  topicId?: string;
  initialTitle?: string;
}

export function TopicFormDialog({ classId, mode, topicId, initialTitle = "" }: TopicFormDialogProps) {
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
          ? await createTopicAction(classId, title)
          : await renameTopicAction(topicId ?? "", classId, title);
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
      <Button size="sm" className="gap-2" onClick={openDialog}>
        <Plus className="w-4 h-4" />
        Add Topic
      </Button>
    ) : (
      <Button
        size="sm"
        variant="ghost"
        className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground sm:h-7 sm:w-7"
        onClick={openDialog}
        aria-label="Rename topic"
      >
        <Pencil className="w-3.5 h-3.5" />
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="max-h-[90dvh] overflow-y-auto w-full max-w-md rounded-lg border border-border bg-card shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold">{mode === "create" ? "Add topic" : "Rename topic"}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="relative text-muted-foreground hover:text-foreground after:absolute after:-inset-3 after:content-[''] sm:after:hidden"
            aria-label="Close"
            disabled={pending}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="topic-title">Topic title</Label>
            <Input
              id="topic-title"
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
              {mode === "create" ? "Add topic" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
