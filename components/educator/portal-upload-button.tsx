"use client";

import { useState } from "react";
import { UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUploadActions } from "@/components/educator/upload-manager";

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, "");
}

/**
 * Library upload entry for the portal: pick one or more files and they land in
 * the educator's library unplaced. Placement into classes happens afterwards via
 * the assign dialog — so unlike the curriculum dialog this passes no subtopic.
 */
export function PortalUploadButton() {
  const { enqueue } = useUploadActions();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFiles([]);
    setTitles([]);
    setDescription("");
    setError(null);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const handleFiles = (list: FileList | null) => {
    const picked = list ? Array.from(list) : [];
    setFiles(picked);
    setTitles(picked.map((file) => stripExtension(file.name)));
    setError(null);
  };

  const setTitleAt = (index: number, value: string) => {
    setTitles((prev) => prev.map((title, i) => (i === index ? value : title)));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (files.length === 0) {
      setError("Choose at least one video file.");
      return;
    }
    if (titles.some((title) => !title.trim())) {
      setError("Every video needs a title.");
      return;
    }
    enqueue(
      files.map((file, index) => ({
        file,
        title: (titles[index] ?? "").trim(),
        description: description.trim(),
      })),
    );
    close();
  };

  if (!open) {
    return (
      <Button className="gap-2 shadow-md" onClick={() => setOpen(true)}>
        <UploadCloud className="w-4 h-4" />
        Upload videos
      </Button>
    );
  }

  const multiple = files.length > 1;
  const canSubmit = files.length > 0 && titles.every((title) => title.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Upload video{multiple ? "s" : ""}
          </h2>
          <button
            type="button"
            onClick={close}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="portal-video-file">Video file(s)</Label>
            <Input
              id="portal-video-file"
              type="file"
              accept="video/*"
              multiple
              autoFocus
              onChange={(event) => handleFiles(event.target.files)}
            />
            <p className="text-[11px] text-muted-foreground">
              Videos upload in the background and land in your library. Add them to classes
              afterwards.
            </p>
          </div>

          {files.length === 1 && (
            <div className="grid gap-2">
              <Label htmlFor="portal-video-title">Title</Label>
              <Input
                id="portal-video-title"
                value={titles[0] ?? ""}
                onChange={(event) => setTitleAt(0, event.target.value)}
                maxLength={255}
              />
            </div>
          )}

          {multiple && (
            <div className="grid gap-2">
              <Label>Titles ({files.length} videos)</Label>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    className="grid gap-1"
                  >
                    <Input
                      value={titles[index] ?? ""}
                      onChange={(event) => setTitleAt(index, event.target.value)}
                      maxLength={255}
                    />
                    <span className="text-[10px] text-muted-foreground truncate">{file.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="portal-video-description">
              Description{" "}
              <span className="font-normal text-muted-foreground">
                (optional{multiple ? ", applies to all" : ""})
              </span>
            </Label>
            <textarea
              id="portal-video-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={5000}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {multiple ? `Upload ${files.length} videos` : "Upload"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
