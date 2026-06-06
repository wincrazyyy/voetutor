"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, Film, PlayCircle, Plus, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { addVideosToSubtopicAction } from "@/app/actions/videos";
import { formatShortDuration } from "@/lib/utils/format";
import type { VideoStatus } from "@/lib/types/database";
import type { LibraryVideo } from "@/lib/queries/video-library";

interface AddVideosToSubtopicDialogProps {
  classId: string;
  subtopicId: string;
  subtopicLabel: string;
  libraryVideos: LibraryVideo[];
  placedVideoIds: string[];
}

function statusLabel(status: VideoStatus): string | null {
  if (status === "ready") return null;
  if (status === "errored") return "Failed";
  return "Processing";
}

/**
 * Board picker that places existing LIBRARY videos into a subtopic (multi-select)
 * — the curriculum-side counterpart to the portal's per-video assign dialog.
 * Videos already in this subtopic are tucked into a collapsed section so the
 * focus stays on what can be added; each addable row shows where the video
 * already lives (class / topic / subtopic). New videos are uploaded on the
 * portal, surfaced as a prominent call to action.
 */
export function AddVideosToSubtopicDialog({
  classId,
  subtopicId,
  subtopicLabel,
  libraryVideos,
  placedVideoIds,
}: AddVideosToSubtopicDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [showAdded, setShowAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const placed = new Set(placedVideoIds);
  const available = libraryVideos.filter((video) => !placed.has(video.id));
  const added = libraryVideos.filter((video) => placed.has(video.id));
  const needle = query.trim().toLowerCase();
  const filteredAvailable = needle
    ? available.filter((video) => video.title.toLowerCase().includes(needle))
    : available;

  const openDialog = () => {
    setSelected(new Set());
    setQuery("");
    setShowAdded(false);
    setError(null);
    setOpen(true);
  };

  const toggle = (videoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const handleSubmit = () => {
    setError(null);
    if (selected.size === 0) {
      setError("Select at least one video.");
      return;
    }
    startTransition(async () => {
      const result = await addVideosToSubtopicAction(classId, subtopicId, [...selected]);
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
      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={openDialog}>
        <Plus className="w-3 h-3" />
        Add videos
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Film className="w-5 h-5 text-primary shrink-0" />
              Add videos
            </h2>
            <p className="text-sm text-muted-foreground truncate mt-1">{subtopicLabel}</p>
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

        <div className="px-6 pt-4">
          <Link href="/educator/videos" className="block">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 transition-colors hover:bg-primary/10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="rounded-md bg-primary/15 p-2 text-primary shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">Upload a new video</p>
                  <p className="text-xs text-muted-foreground">
                    Add it to your library, then place it here.
                  </p>
                </div>
              </div>
              <Button type="button" size="sm" className="gap-1.5 shrink-0">
                <UploadCloud className="w-4 h-4" />
                Upload
              </Button>
            </div>
          </Link>
        </div>

        {libraryVideos.length > 0 && (
          <div className="px-6 pt-4 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Add from your library
            </span>
            {available.length > 0 && (
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder="Search your library…"
                className="h-9 mt-2"
                disabled={pending}
              />
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-3 min-h-0">
          {libraryVideos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Your library is empty — upload a video to get started.
            </p>
          ) : (
            <>
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  All your library videos are already in this subtopic.
                </p>
              ) : filteredAvailable.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No videos match your search.</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {filteredAvailable.map((video) => {
                    const badge = statusLabel(video.status);
                    const checked = selected.has(video.id);
                    return (
                      <label
                        key={video.id}
                        className={`flex items-start gap-3 rounded-md px-2 py-2 cursor-pointer transition-colors ${
                          checked ? "bg-primary/5" : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(video.id)}
                          disabled={pending}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1 flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate flex-1 min-w-0">
                              {video.title}
                            </span>
                            {badge && (
                              <Badge
                                variant="secondary"
                                className={`text-[9px] uppercase tracking-wider font-bold shrink-0 ${
                                  video.status === "errored"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {badge}
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatShortDuration(video.duration)}
                            </span>
                          </div>
                          {video.placements.length === 0 ? (
                            <span className="text-[11px] italic text-muted-foreground">
                              Not in any class yet
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {video.placements.map((placement) => (
                                <span
                                  key={placement.placement_id}
                                  title={`${placement.class_title} / ${placement.topic_title} / ${placement.subtopic_title}`}
                                  className="inline-flex items-center gap-1 text-[10px] rounded border border-border bg-muted/40 px-1.5 py-0.5 text-muted-foreground max-w-full"
                                >
                                  <span className="font-medium text-foreground truncate max-w-[8rem]">
                                    {placement.class_title}
                                  </span>
                                  <span className="opacity-50">/</span>
                                  <span className="truncate max-w-[6rem]">
                                    {placement.topic_title}
                                  </span>
                                  <span className="opacity-50">/</span>
                                  <span className="truncate max-w-[6rem]">
                                    {placement.subtopic_title}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {added.length > 0 && (
                <div className="mt-6 border-t border-border/60 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAdded((value) => !value)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {showAdded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    Already in this subtopic ({added.length})
                  </button>
                  {showAdded && (
                    <div className="mt-2 flex flex-col gap-0.5">
                      {added.map((video) => (
                        <div
                          key={video.id}
                          className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
                        >
                          <PlayCircle className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          <span className="truncate flex-1">{video.title}</span>
                          <span className="shrink-0">{formatShortDuration(video.duration)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {error && <p className="px-6 text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2 p-6 pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={pending || selected.size === 0}>
              {pending ? "Adding…" : `Add${selected.size > 0 ? ` ${selected.size}` : ""}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
