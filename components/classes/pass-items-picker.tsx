"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderTree, PlaySquare, Ticket, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { setClassPassItemsAction, type PassItemInput, type PassItemKind } from "@/app/actions/class-passes";

/** A leaf content entry in the picker tree — a placed library video or note. */
export interface PickerItem {
  kind: "video" | "note";
  id: string;
  title: string;
}

export interface PickerSubtopic {
  id: string;
  title: string;
  items: PickerItem[];
}

export interface PickerTopic {
  id: string;
  title: string;
  items: PickerItem[];
  subtopics: PickerSubtopic[];
}

function itemKey(kind: PassItemKind, id: string): string {
  return `${kind}:${id}`;
}

function parseKey(key: string): PassItemInput {
  const idx = key.indexOf(":");
  return { kind: key.slice(0, idx) as PassItemKind, id: key.slice(idx + 1) };
}

/**
 * The pass-contents checkbox tree: topics, subtopics, and individual videos/notes of ONE class.
 * Checking a topic implies its whole subtree (children render disabled-checked but are NOT added
 * to the explicit set — the DB grant algebra already covers descendants, so the stored item set
 * stays minimal). Leaf checks grant the LIBRARY item (video/note) wherever it is placed in this
 * class, so the same video shown under two nodes checks in both places. Saving reconciles
 * class_pass_items to the checked set via setClassPassItemsAction.
 */
export function PassItemsPicker({
  passId,
  classId,
  passName,
  topics,
  initialKeys,
  onClose,
}: {
  passId: string;
  classId: string;
  passName: string;
  topics: PickerTopic[];
  initialKeys: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialKeys));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const items = [...selected].map(parseKey);
    startTransition(async () => {
      const result = await setClassPassItemsAction(passId, classId, items);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const selectedCount = selected.size;

  const renderItem = (item: PickerItem, covered: boolean, indentClass: string) => {
    const key = itemKey(item.kind, item.id);
    return (
      <label
        key={key}
        className={`flex items-center gap-2.5 ${indentClass} py-1 text-sm ${
          covered ? "text-muted-foreground" : "cursor-pointer hover:text-primary"
        } transition-colors`}
      >
        <Checkbox
          checked={covered || selected.has(key)}
          disabled={pending || covered}
          onCheckedChange={() => toggle(key)}
        />
        {item.kind === "video" ? (
          <PlaySquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{item.title}</span>
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Ticket className="w-5 h-5 text-primary shrink-0" />
              Pass contents
            </h2>
            <p className="text-sm text-muted-foreground truncate mt-1">{passName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Close"
            disabled={pending}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {topics.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                This class has no curriculum yet. Add topics and content first, then define what
                this pass grants.
              </p>
            ) : (
              topics.map((topic) => {
                const topicChecked = selected.has(`topic:${topic.id}`);
                return (
                  <div key={topic.id} className="space-y-1.5">
                    <label className="flex items-center gap-2.5 py-1 text-sm cursor-pointer font-semibold hover:text-primary transition-colors">
                      <Checkbox
                        checked={topicChecked}
                        disabled={pending}
                        onCheckedChange={() => toggle(`topic:${topic.id}`)}
                      />
                      <FolderTree className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{topic.title}</span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        (whole topic, incl. future content)
                      </span>
                    </label>

                    {topic.items.map((item) => renderItem(item, topicChecked, "pl-6"))}

                    {topic.subtopics.map((subtopic) => {
                      const subCovered = topicChecked;
                      const subChecked = subCovered || selected.has(`subtopic:${subtopic.id}`);
                      return (
                        <div key={subtopic.id} className="space-y-1">
                          <label
                            className={`flex items-center gap-2.5 pl-6 py-1 text-sm font-medium ${
                              subCovered
                                ? "text-muted-foreground"
                                : "cursor-pointer hover:text-primary"
                            } transition-colors`}
                          >
                            <Checkbox
                              checked={subChecked}
                              disabled={pending || subCovered}
                              onCheckedChange={() => toggle(`subtopic:${subtopic.id}`)}
                            />
                            <span className="truncate">{subtopic.title}</span>
                          </label>
                          {subtopic.items.map((item) => renderItem(item, subChecked, "pl-12"))}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {error && <p className="px-6 text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2 p-6 pt-4 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {selectedCount} grant{selectedCount === 1 ? "" : "s"} selected
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} loadingText="Saving…">
                Save contents
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
