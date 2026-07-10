"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderTree, Layers, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { setVideoPlacementsAction } from "@/app/actions/videos";
import type { PlacementParent } from "@/lib/types/database";
import type { PlacementTreeClass } from "@/lib/queries/video-library";

interface VideoAssignDialogProps {
  videoId: string;
  videoTitle: string;
  currentParents: PlacementParent[];
  tree: PlacementTreeClass[];
}

function key(parent: PlacementParent): string {
  return `${parent.kind}:${parent.id}`;
}

/**
 * Per-video placement picker: tick the curriculum nodes — topics and/or subtopics, across any of the
 * educator's classes — where this video should appear. Ticking nodes in two different classes is how a
 * single library video overlaps into both. Submitting reconciles the video's placements to the ticked
 * set. A topic itself is tickable (a topic-level intro video), as is any subtopic under it.
 */
export function VideoAssignDialog({ videoId, videoTitle, currentParents, tree }: VideoAssignDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentParents.map(key)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openDialog = () => {
    setSelected(new Set(currentParents.map(key)));
    setError(null);
    setOpen(true);
  };

  const toggle = (k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const parents: PlacementParent[] = [...selected].map((k) => {
      const [kind, id] = k.split(":");
      return { kind: kind as "topic" | "subtopic", id };
    });
    startTransition(async () => {
      const result = await setVideoPlacementsAction(videoId, parents);
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
      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={openDialog}>
        <Layers className="w-3.5 h-3.5" />
        Manage placements
      </Button>
    );
  }

  const selectedCount = selected.size;
  const hasNodes = tree.some((cls) => cls.topics.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary shrink-0" />
              Place in classes
            </h2>
            <p className="text-sm text-muted-foreground truncate mt-1">{videoTitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Close"
            disabled={pending}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {!hasNodes ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                You have no topics yet. Add topics and subtopics to a class first, then place videos
                into them.
              </p>
            ) : (
              tree.map((cls) => (
                <div key={cls.id} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <FolderTree className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate">{cls.title}</span>
                    <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                      {cls.code}
                    </span>
                  </div>
                  {cls.topics.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic pl-6">No topics yet.</p>
                  ) : (
                    cls.topics.map((topic) => (
                      <div key={topic.id} className="pl-6 space-y-1.5">
                        <label className="flex items-center gap-2.5 py-1 text-sm cursor-pointer font-semibold hover:text-primary transition-colors">
                          <Checkbox
                            checked={selected.has(`topic:${topic.id}`)}
                            onCheckedChange={() => toggle(`topic:${topic.id}`)}
                            disabled={pending}
                          />
                          <span className="truncate">{topic.title}</span>
                          <span className="text-[10px] font-normal text-muted-foreground">(topic-level)</span>
                        </label>
                        {topic.subtopics.map((subtopic) => (
                          <label
                            key={subtopic.id}
                            className="flex items-center gap-2.5 pl-5 py-1 text-sm cursor-pointer hover:text-primary transition-colors"
                          >
                            <Checkbox
                              checked={selected.has(`subtopic:${subtopic.id}`)}
                              onCheckedChange={() => toggle(`subtopic:${subtopic.id}`)}
                              disabled={pending}
                            />
                            <span className="truncate">{subtopic.title}</span>
                          </label>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              ))
            )}
          </div>

          {error && <p className="px-6 text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2 p-6 pt-4 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {selectedCount} location{selectedCount === 1 ? "" : "s"} selected
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} loadingText="Saving...">
                Save placements
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
