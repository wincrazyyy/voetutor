"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeleteAccountButtonProps {
  accountId: string;
  accountName: string;
  /** The "this removes …" copy specific to the account kind, rendered in the red info box. */
  description: React.ReactNode;
  action: (accountId: string, confirmation: string) => Promise<{ error?: string; ok?: boolean }>;
}

/** Force the admin to TYPE the id — block paste and drag-drop into the confirmation field. */
const blockClipboard = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault();

export function DeleteAccountButton({
  accountId,
  accountName,
  description,
  action,
}: DeleteAccountButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  /* Confirm against the account id, not the name: ids are unique, so an admin can never accidentally
     type a value that matches a different, same-named account. Paste is blocked, so the only way through
     is to read the id from this modal and type it — the deliberate "super gate". */
  const matches = confirmation.trim() === accountId;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  /** Restore focus to the trigger when the dialog closes (aria-modal focus hygiene). */
  useEffect(() => {
    if (wasOpenRef.current && !open) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  /** Keep Tab focus inside the dialog. */
  const trapFocus = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'button, input, [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!nodes) return;
    const focusable = Array.from(nodes).filter((node) => !node.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const reset = () => {
    setConfirmation("");
    setError(null);
  };

  const handleDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      const result = await action(accountId, confirmation);
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
        ref={triggerRef}
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="w-full max-w-md rounded-lg border border-destructive/30 bg-card p-6 shadow-lg"
        onKeyDown={trapFocus}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 id="delete-account-title" className="text-lg font-bold">
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
              Deleting <span className="font-semibold text-foreground">{accountName}</span> {description}
            </p>
          </div>

          <form onSubmit={handleDelete} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="delete-account-confirm">Type this account&apos;s ID to confirm (no pasting):</Label>
              <p className="select-all break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
                {accountId}
              </p>
              <Input
                id="delete-account-confirm"
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
