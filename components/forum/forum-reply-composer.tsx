"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/forum/markdown-editor";
import { createForumReplyAction } from "@/app/actions/forum";

interface ForumReplyComposerProps {
  classId: string;
  postId: string;
  parentReplyId?: string | null;
  /** When the thread is a lesson Q&A, pass the video id so the lesson page revalidates too. */
  videoId?: string | null;
  /** Current user's id — enables image embeds in the editor. */
  uploaderId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
}

export function ForumReplyComposer({
  classId,
  postId,
  parentReplyId = null,
  videoId = null,
  uploaderId,
  placeholder = "Write a reply…",
  autoFocus = false,
  compact = false,
  onDone,
  onCancel,
}: ForumReplyComposerProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createForumReplyAction({ classId, postId, parentReplyId, videoId, content });
      if (res.error) {
        setError(res.error);
        return;
      }
      setContent("");
      router.refresh();
      onDone?.();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <MarkdownEditor
        value={content}
        onChange={setContent}
        minRows={compact ? 2 : 3}
        autoFocus={autoFocus}
        placeholder={placeholder}
        uploaderId={uploaderId}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending || content.trim().length === 0}>
          {pending ? "Posting…" : "Reply"}
        </Button>
      </div>
    </form>
  );
}
