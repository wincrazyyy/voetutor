"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/forum/markdown-editor";
import { ANNOUNCEMENT_LIMITS } from "@/lib/announcements/limits";
import { createAnnouncementAction, updateAnnouncementAction } from "@/app/actions/announcements";
import type { Announcement, AnnouncementType } from "@/lib/types/database";

interface AnnouncementFormProps {
  classId: string;
  authorId: string;
  /** Present → edit mode; absent → create. */
  announcement?: Announcement;
}

/** ISO instant → a `datetime-local` value in the browser's timezone (YYYY-MM-DDTHH:mm). */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AnnouncementForm({ classId, authorId, announcement }: AnnouncementFormProps) {
  const router = useRouter();
  const isEdit = Boolean(announcement);
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [content, setContent] = useState(announcement?.content ?? "");
  const [type, setType] = useState<AnnouncementType>(announcement?.type ?? "standard");
  const [linkTitle, setLinkTitle] = useState(announcement?.link_title ?? "");
  const [linkUrl, setLinkUrl] = useState(announcement?.link_url ?? "");
  const [eventLocal, setEventLocal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /* Prefill the picker post-mount (client timezone) to avoid an SSR/hydration mismatch on the value. */
  useEffect(() => {
    if (announcement?.event_at) setEventLocal(toLocalInputValue(announcement.event_at));
  }, [announcement?.event_at]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const eventAt = type === "event" && eventLocal ? new Date(eventLocal).toISOString() : null;
    const input = { classId, title, content, type, linkTitle: linkTitle || null, linkUrl: linkUrl || null, eventAt };
    startTransition(async () => {
      const res = isEdit
        ? await updateAnnouncementAction(announcement!.id, input)
        : await createAnnouncementAction(input);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(`/class/${classId}`);
      router.refresh();
    });
  };

  return (
    <Card className="p-6 border-border shadow-sm bg-card">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="ann-title">Title</Label>
          <Input
            id="ann-title"
            placeholder="Topic 2 Practice Quiz Live"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={ANNOUNCEMENT_LIMITS.titleMax}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ann-content">Content</Label>
          <MarkdownEditor
            id="ann-content"
            value={content}
            onChange={setContent}
            minRows={6}
            uploaderId={authorId}
            placeholder="Share details, instructions, or context for your students. Markdown + image embeds supported."
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ann-type">Type</Label>
          <select
            id="ann-type"
            value={type}
            onChange={(e) => setType(e.target.value as AnnouncementType)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="standard">Standard</option>
            <option value="important">Important</option>
            <option value="event">Event</option>
          </select>
        </div>

        {type === "event" && (
          <div className="grid gap-2">
            <Label htmlFor="ann-event">Event date &amp; time</Label>
            <Input
              id="ann-event"
              type="datetime-local"
              value={eventLocal}
              onChange={(e) => setEventLocal(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Optional. Shown to students in their local time.</p>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ann-link-title">Link title (optional)</Label>
            <Input
              id="ann-link-title"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              maxLength={255}
              placeholder="Start Practice Quiz"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ann-link-url">Link URL (optional)</Label>
            <Input
              id="ann-link-url"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              pattern="https://.*"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={pending}
            loadingText="Saving…"
            disabled={!title.trim() || !content.trim()}
          >
            {isEdit ? "Save Changes" : "Post Announcement"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
