"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, PlayCircle, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FORUM_LIMITS } from "@/lib/forum/limits";
import { MarkdownEditor } from "@/components/forum/markdown-editor";
import { createForumPostAction } from "@/app/actions/forum";
import type { ForumPostType } from "@/lib/types/database";

interface ForumNewPostDialogProps {
  classId: string;
  videos: Array<{ id: string; title: string }>;
  uploaderId: string;
}

export function ForumNewPostDialog({ classId, videos, uploaderId }: ForumNewPostDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ForumPostType>("general");
  const [videoId, setVideoId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setType("general");
    setVideoId("");
    setTitle("");
    setContent("");
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (type === "video_qa" && !videoId) {
      setError("Pick a lesson for this question.");
      return;
    }
    startTransition(async () => {
      const res = await createForumPostAction({
        classId,
        type,
        videoId: type === "video_qa" ? videoId : null,
        title,
        content,
      });
      if (res.error || !res.postId) {
        setError(res.error ?? "Could not create the post.");
        return;
      }
      setOpen(false);
      router.push(`/class/${classId}/forum/${res.postId}`);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button
        className="gap-2 shadow-md"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus className="w-4 h-4" />
        New Post
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold">Start a discussion</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType("general")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                type === "general" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted",
              )}
            >
              <MessageSquare className="w-4 h-4" />
              Discussion
            </button>
            <button
              type="button"
              onClick={() => setType("video_qa")}
              disabled={videos.length === 0}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                type === "video_qa" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted",
              )}
              title={videos.length === 0 ? "No lessons in this class yet" : undefined}
            >
              <PlayCircle className="w-4 h-4" />
              Lesson question
            </button>
          </div>

          {type === "video_qa" && (
            <div className="grid gap-1.5">
              <label htmlFor="forum-video" className="text-sm font-semibold">Lesson</label>
              <select
                id="forum-video"
                value={videoId}
                onChange={(e) => setVideoId(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a lesson…</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>{v.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-1.5">
            <label htmlFor="forum-title" className="text-sm font-semibold">Title</label>
            <input
              id="forum-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={FORUM_LIMITS.titleMax}
              placeholder={type === "video_qa" ? "What's your question?" : "What do you want to discuss?"}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="forum-body" className="text-sm font-semibold">Details</label>
            <MarkdownEditor
              id="forum-body"
              value={content}
              onChange={setContent}
              minRows={6}
              placeholder="Add the details…"
              uploaderId={uploaderId}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || title.trim().length < FORUM_LIMITS.titleMin || content.trim().length === 0}
            >
              {pending ? "Posting…" : "Post"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
