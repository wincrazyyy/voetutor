"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Film, PlayCircle, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VideoRenameDialog } from "@/components/educator/video-rename-dialog";
import { VideoAssignDialog } from "@/components/educator/video-assign-dialog";
import { deleteVideoAction } from "@/app/actions/videos";
import { formatShortDuration } from "@/lib/utils/format";
import type { VideoStatus } from "@/lib/types/database";
import type { LibraryVideo, PlacementTreeClass } from "@/lib/queries/video-library";

interface VideoLibraryListProps {
  videos: LibraryVideo[];
  tree: PlacementTreeClass[];
}

function statusBadge(status: VideoStatus): { label: string; destructive: boolean } | null {
  switch (status) {
    case "ready":
      return null;
    case "errored":
      return { label: "Failed", destructive: true };
    case "uploading":
      return { label: "Uploading", destructive: false };
    case "queued":
      return { label: "Queued", destructive: false };
    default:
      return { label: "Processing", destructive: false };
  }
}

function LibraryVideoCard({
  video,
  tree,
}: {
  video: LibraryVideo;
  tree: PlacementTreeClass[];
}) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const badge = statusBadge(video.status);
  const ready = video.status === "ready";
  const hasThumb = ready && Boolean(video.thumbnail_url);
  const classCount = new Set(video.placements.map((placement) => placement.class_id)).size;

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteVideoAction(video.id);
      if (result?.error) {
        setError(result.error);
        setConfirmingDelete(false);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card className="flex flex-col sm:flex-row gap-4 p-4 border-border bg-card shadow-sm">
      <div
        className="relative w-full sm:w-40 aspect-video rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center bg-cover bg-center"
        style={hasThumb ? { backgroundImage: `url(${video.thumbnail_url})` } : undefined}
      >
        {!hasThumb && <PlayCircle className="w-8 h-8 text-muted-foreground/60" />}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {ready ? (
                <Link
                  href={`/lessons/${video.id}`}
                  className="text-sm font-semibold truncate hover:text-primary transition-colors"
                >
                  {video.title}
                </Link>
              ) : (
                <span className="text-sm font-semibold truncate">{video.title}</span>
              )}
              {badge && (
                <Badge
                  variant="secondary"
                  className={`text-[9px] uppercase tracking-wider font-bold shrink-0 ${
                    badge.destructive
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {badge.label}
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {formatShortDuration(video.duration)}
            </span>
          </div>
          <VideoRenameDialog videoId={video.id} classId={null} initialTitle={video.title} />
        </div>

        {video.placements.length === 0 ? (
          <span className="inline-flex w-fit items-center text-[11px] italic rounded-full border border-dashed border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
            Not in any class yet
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {video.placements.map((placement) => (
              <span
                key={placement.placement_id}
                className="inline-flex items-center gap-1 text-[11px] rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground"
                title={`${placement.class_title} → ${placement.topic_title} → ${placement.subtopic_title}`}
              >
                <span className="font-medium text-foreground truncate max-w-[10rem]">
                  {placement.class_title}
                </span>
                <span className="opacity-60">·</span>
                <span className="truncate max-w-[10rem]">{placement.subtopic_title}</span>
              </span>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center gap-2 mt-auto pt-1">
          <VideoAssignDialog
            videoId={video.id}
            videoTitle={video.title}
            currentSubtopicIds={video.placements.map((placement) => placement.subtopic_id)}
            tree={tree}
          />
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {classCount === 0
                  ? "Delete this video permanently?"
                  : `Delete from ${classCount} class${classCount === 1 ? "" : "es"}?`}
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={handleDelete}
                disabled={pending}
              >
                {pending ? "Deleting..." : "Delete"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * The educator's video library: every owned video with its placement chips,
 * inline rename, the assign-to-classes picker (overlap), and library deletion.
 */
export function VideoLibraryList({ videos, tree }: VideoLibraryListProps) {
  if (videos.length === 0) {
    return (
      <Card className="p-10 border border-dashed border-border bg-card/50 text-center">
        <Film className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <h3 className="text-lg font-bold mb-1">No videos yet</h3>
        <p className="text-sm text-muted-foreground">
          Upload your first teaching video — it lands here, then you place it into your classes.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {videos.map((video) => (
        <LibraryVideoCard key={video.id} video={video} tree={tree} />
      ))}
    </div>
  );
}
