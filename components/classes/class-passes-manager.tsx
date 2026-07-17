"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ListChecks, Pencil, Plus, Ticket, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ClassPassSummary } from "@/lib/queries/class-access";
import type { ClassPassItem } from "@/lib/types/database";
import {
  createClassPassAction,
  renameClassPassAction,
  deleteClassPassAction,
} from "@/app/actions/class-passes";
import { PassItemsPicker, type PickerTopic } from "@/components/classes/pass-items-picker";

function itemKeysOf(items: ClassPassItem[]): string[] {
  return items
    .map((item) => {
      if (item.topic_id) return `topic:${item.topic_id}`;
      if (item.subtopic_id) return `subtopic:${item.subtopic_id}`;
      if (item.video_id) return `video:${item.video_id}`;
      if (item.resource_id) return `note:${item.resource_id}`;
      return null;
    })
    .filter((key): key is string => key !== null);
}

function itemSummary(items: ClassPassItem[]): string {
  const counts = { topic: 0, subtopic: 0, video: 0, note: 0 };
  for (const item of items) {
    if (item.topic_id) counts.topic += 1;
    else if (item.subtopic_id) counts.subtopic += 1;
    else if (item.video_id) counts.video += 1;
    else if (item.resource_id) counts.note += 1;
  }
  const parts: string[] = [];
  if (counts.topic) parts.push(`${counts.topic} topic${counts.topic === 1 ? "" : "s"}`);
  if (counts.subtopic) parts.push(`${counts.subtopic} subtopic${counts.subtopic === 1 ? "" : "s"}`);
  if (counts.video) parts.push(`${counts.video} video${counts.video === 1 ? "" : "s"}`);
  if (counts.note) parts.push(`${counts.note} note${counts.note === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "Grants nothing yet";
}

/**
 * The "Access passes" tab: create / rename / delete the class's passes and edit each pass's
 * contents via the checkbox-tree picker. Deleting warns with the holder + targeted-announcement
 * counts, because both cascade away with the pass (holders stay enrolled, fail-closed).
 */
export function ClassPassesManager({
  classId,
  passes,
  topics,
}: {
  classId: string;
  passes: ClassPassSummary[];
  topics: PickerTopic[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  /* Which action is in flight ("create" | `rename:${id}` | `delete:${id}`), so only the clicked
     button spins while isPending disables the whole panel against concurrent edits. */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ passId: string; passName: string; keys: string[] } | null>(
    null,
  );

  const create = () => {
    const name = newName.trim();
    if (!name || isPending) return;
    setBusy("create");
    startTransition(async () => {
      try {
        setError(null);
        const res = await createClassPassAction(classId, name);
        if (res.error) {
          setError(res.error);
          return;
        }
        setNewName("");
        if (res.passId) setPicker({ passId: res.passId, passName: name, keys: [] });
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  const rename = (passId: string) => {
    const name = renameName.trim();
    if (!name || isPending) return;
    setBusy(`rename:${passId}`);
    startTransition(async () => {
      try {
        setError(null);
        const res = await renameClassPassAction(passId, classId, name, renameDescription);
        if (res.error) {
          setError(res.error);
          return;
        }
        setRenamingId(null);
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  const remove = (passId: string) => {
    setBusy(`delete:${passId}`);
    startTransition(async () => {
      try {
        setError(null);
        const res = await deleteClassPassAction(passId, classId);
        if (res.error) {
          setError(res.error);
          return;
        }
        setConfirmingDelete(null);
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Card className="flex flex-col gap-4 border-border p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Ticket className="h-4 w-4 text-primary" />
            New access pass
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A pass is a named subset of this class&apos;s curriculum — for trials and partial
            purchases. Grant it to students from the Roster tab, or mint a scoped invite link.
          </p>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="pass-name">Pass name</Label>
            <Input
              id="pass-name"
              value={newName}
              maxLength={80}
              disabled={isPending}
              placeholder="e.g. Trial — first 2 lessons"
              onChange={(e) => {
                setNewName(e.target.value);
                setError(null);
              }}
            />
          </div>
          <Button
            type="submit"
            loading={busy === "create"}
            disabled={isPending || !newName.trim()}
            loadingText="Creating…"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Create pass
          </Button>
        </form>
      </Card>

      {passes.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 border-dashed border-border p-10 text-center">
          <Ticket className="h-9 w-9 text-muted-foreground" />
          <h3 className="text-base font-bold text-foreground">No passes yet</h3>
          <p className="text-sm text-muted-foreground">
            Create one above to offer a trial or a partial slice of this class.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {passes.map((pass) => {
            const confirming = confirmingDelete === pass.id;
            const renaming = renamingId === pass.id;

            return (
              <Card key={pass.id} className="flex flex-col gap-3 border-border p-4 sm:p-5">
                {renaming ? (
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename(pass.id);
                    }}
                  >
                    <div className="grid gap-1.5">
                      <Label htmlFor={`rename-${pass.id}`}>Pass name</Label>
                      <Input
                        id={`rename-${pass.id}`}
                        value={renameName}
                        maxLength={80}
                        disabled={isPending}
                        onChange={(e) => setRenameName(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`redesc-${pass.id}`}>Description (optional)</Label>
                      <Input
                        id={`redesc-${pass.id}`}
                        value={renameDescription}
                        maxLength={500}
                        disabled={isPending}
                        placeholder="Only you see this"
                        onChange={(e) => setRenameDescription(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        loading={busy === `rename:${pass.id}`}
                        disabled={isPending || !renameName.trim()}
                        loadingText="Saving…"
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => setRenamingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                          <Ticket className="h-4 w-4 shrink-0 text-gold" />
                          <span className="truncate">{pass.name}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {pass.holder_count} holder{pass.holder_count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{itemSummary(pass.items)}</p>
                      {pass.description ? (
                        <p className="mt-1 text-xs text-muted-foreground">{pass.description}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={isPending}
                        onClick={() =>
                          setPicker({
                            passId: pass.id,
                            passName: pass.name,
                            keys: itemKeysOf(pass.items),
                          })
                        }
                      >
                        <ListChecks className="h-3.5 w-3.5" />
                        Edit contents
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Rename pass"
                        className="min-w-11 gap-1.5 sm:min-w-0"
                        disabled={isPending}
                        onClick={() => {
                          setRenamingId(pass.id);
                          setRenameName(pass.name);
                          setRenameDescription(pass.description ?? "");
                          setError(null);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Rename</span>
                      </Button>
                      {confirming ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => setConfirmingDelete(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            loading={busy === `delete:${pass.id}`}
                            disabled={isPending}
                            loadingText="Deleting…"
                            onClick={() => remove(pass.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete pass"
                          className={cn("min-w-11 gap-1.5 text-muted-foreground hover:text-destructive sm:min-w-0")}
                          disabled={isPending}
                          onClick={() => {
                            setConfirmingDelete(pass.id);
                            setError(null);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {confirming ? (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {pass.holder_count > 0
                        ? `${pass.holder_count} student${pass.holder_count === 1 ? " holds" : "s hold"} this pass — deleting it removes their access to its content (they stay enrolled with restricted access). `
                        : ""}
                      {pass.announcement_count > 0
                        ? `${pass.announcement_count} targeted announcement${pass.announcement_count === 1 ? "" : "s"} sent to this pass, along with their read receipts, will be permanently deleted. `
                        : ""}
                      Scoped invite links for this pass stop working. This cannot be undone.
                    </span>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {picker ? (
        <PassItemsPicker
          passId={picker.passId}
          classId={classId}
          passName={picker.passName}
          topics={topics}
          initialKeys={picker.keys}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}
