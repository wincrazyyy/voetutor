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
  /** The class's Access Passes. When present (and creating), an Audience select appears; the
   *  audience is create-time-only — editing never changes it. */
  passes?: Array<{ id: string; name: string }>;
}

/** ISO instant → a `datetime-local` value in the browser's timezone (YYYY-MM-DDTHH:mm). */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AnnouncementForm({ classId, authorId, announcement, passes = [] }: AnnouncementFormProps) {
  const router = useRouter();
  const isEdit = Boolean(announcement);
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [content, setContent] = useState(announcement?.content ?? "");
  const [type, setType] = useState<AnnouncementType>(announcement?.type ?? "standard");
  const [linkTitle, setLinkTitle] = useState(announcement?.link_title ?? "");
  const [linkUrl, setLinkUrl] = useState(announcement?.link_url ?? "");
  const [eventLocal, setEventLocal] = useState("");
  /* "" = everyone in the class (broadcast); otherwise the target pass id. Create-time only. */
  const [passId, setPassId] = useState("");
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
    const input = {
      classId,
      title,
      content,
      type,
      linkTitle: linkTitle || null,
      linkUrl: linkUrl || null,
      eventAt,
      passId: isEdit ? undefined : passId || null,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateAnnouncementAction(announcement!.id, input)
        : await createAnnouncementAction(input);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(
        isEdit
          ? `/class/${classId}/announcements#announcement-${announcement!.id}`
          : `/class/${classId}`,
      );
      router.refresh();
    });
  };

  return (
    <Card className="p-4 sm:p-6 border-border shadow-sm bg-card">
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
            className="rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
          >
            <option value="standard">Standard</option>
            <option value="important">Important</option>
            <option value="event">Event</option>
          </select>
        </div>

        {!isEdit && passes.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="ann-audience">Audience</Label>
            <select
              id="ann-audience"
              value={passId}
              onChange={(e) => setPassId(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
            >
              <option value="">Everyone in this class</option>
              {passes.map((pass) => (
                <option key={pass.id} value={pass.id}>
                  Holders of “{pass.name}”
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Targeting a pass means only its holders (and you) can see this announcement. The
              audience can&apos;t be changed after posting.
            </p>
          </div>
        )}

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

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            loading={pending}
            loadingText="Saving…"
            disabled={!title.trim() || !content.trim()}
            className="w-full sm:w-auto"
          >
            {isEdit ? "Save Changes" : "Post Announcement"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
