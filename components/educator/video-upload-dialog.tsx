"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { Plus, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { createVideoUploadAction, deleteVideoAction } from "@/app/actions/videos";

/** tus chunk size — Cloudflare requires a multiple of 256 KiB; 50 MB works. */
const CHUNK_SIZE = 50 * 1024 * 1024;

interface VideoUploadDialogProps {
  subtopicId: string;
}

export function VideoUploadDialog({ subtopicId }: VideoUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pending, startTransition] = useTransition();

  const uploadRef = useRef<tus.Upload | null>(null);
  const videoIdRef = useRef<string | null>(null);

  const busy = pending || uploading;

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setFile(null);
    setError(null);
    setProgress(0);
  };

  const closeDialog = () => {
    if (busy) return;
    setOpen(false);
    resetForm();
  };

  const startUpload = (uploadUrl: string, selectedFile: File) => {
    setUploading(true);
    setProgress(0);
    const upload = new tus.Upload(selectedFile, {
      uploadUrl,
      chunkSize: CHUNK_SIZE,
      metadata: { name: selectedFile.name, filetype: selectedFile.type },
      onProgress: (sent, total) => {
        setProgress(total > 0 ? Math.round((sent / total) * 100) : 0);
      },
      onError: () => {
        setUploading(false);
        setError("The upload failed. Please try again.");
        const videoId = videoIdRef.current;
        videoIdRef.current = null;
        if (videoId) void deleteVideoAction(videoId);
      },
      onSuccess: () => {
        setUploading(false);
        setOpen(false);
        resetForm();
        videoIdRef.current = null;
        router.refresh();
      },
    });
    uploadRef.current = upload;
    upload.start();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const selectedFile = file;
    if (!selectedFile) {
      setError("Choose a video file to upload.");
      return;
    }
    startTransition(async () => {
      const result = await createVideoUploadAction({
        subtopicId,
        title,
        description,
        fileSizeBytes: selectedFile.size,
      });
      if (result.error || !result.uploadUrl || !result.videoId) {
        setError(result.error ?? "Could not start the upload.");
        return;
      }
      videoIdRef.current = result.videoId;
      startUpload(result.uploadUrl, selectedFile);
    });
  };

  const handleCancelUpload = () => {
    void uploadRef.current?.abort(true);
    uploadRef.current = null;
    setUploading(false);
    setProgress(0);
    const videoId = videoIdRef.current;
    videoIdRef.current = null;
    if (videoId) void deleteVideoAction(videoId);
  };

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setOpen(true)}>
        <Plus className="w-3 h-3" />
        Add Video
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Upload video
          </h2>
          <button
            type="button"
            onClick={closeDialog}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Close"
            disabled={busy}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {uploading ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Uploading <span className="font-semibold text-foreground">{title || file?.name}</span>. Keep this dialog open until it finishes.
            </p>
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground text-center">{progress}%</p>
            <div className="flex justify-end">
              <Button type="button" variant="ghost" onClick={handleCancelUpload}>
                Cancel upload
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="video-title">Video title</Label>
              <Input
                id="video-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={255}
                autoFocus
                disabled={pending}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="video-description">
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <textarea
                id="video-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={5000}
                disabled={pending}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="video-file">Video file</Label>
              <Input
                id="video-file"
                type="file"
                accept="video/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={pending}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeDialog} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !title.trim() || !file}>
                {pending ? "Starting..." : "Upload"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
