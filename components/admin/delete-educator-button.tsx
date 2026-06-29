"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteEducatorAccountAction } from "@/app/actions/educators";

interface DeleteEducatorButtonProps {
  educatorId: string;
  educatorName: string;
}

/** Force the admin to TYPE the id — block paste and drag-drop into the confirmation field. */
const blockClipboard = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault();

export function DeleteEducatorButton({ educatorId, educatorName }: DeleteEducatorButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /* Confirm against the account id, not the name: ids are unique, so an admin can never accidentally
     type a value that matches a different, same-named account. Paste is blocked, so the only way through
     is to read the id from this modal and type it — the deliberate "super gate". */
  const matches = confirmation.trim() === educatorId;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  const reset = () => {
    setConfirmation("");
    setError(null);
  };

  const handleDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteEducatorAccountAction(educatorId, confirmation);
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
        variant="destructive"
        size="icon-sm"
        title="Delete account"
        aria-label="Delete account"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-educator-title"
        className="w-full max-w-md rounded-lg border border-destructive/30 bg-card p-6 shadow-lg"
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 id="delete-educator-title" className="text-lg font-bold">
              Delete account
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
            disabled={pending}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="mb-1 font-semibold text-destructive">This permanently deletes the entire account.</p>
            <p className="text-muted-foreground">
              Deleting <span className="font-semibold text-foreground">{educatorName}</span> removes their
              login, public profile and reviews, every class they own — with all topics, lessons, notes,
              announcements, forum threads, and every student&apos;s enrolment and progress in those
              classes — plus their entire content library and all uploaded videos and files. This cannot be
              undone.
            </p>
          </div>

          <form onSubmit={handleDelete} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="delete-educator-confirm">Type this account&apos;s ID to confirm (no pasting):</Label>
              <p className="select-all break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
                {educatorId}
              </p>
              <Input
                id="delete-educator-confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                onPaste={blockClipboard}
                onDrop={blockClipboard}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Type the ID above…"
                autoFocus
                disabled={pending}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={!matches || pending}>
                {pending ? "Deleting..." : "Delete this account"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
