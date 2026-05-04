"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AnnouncementType } from "@/lib/types/database";

interface AnnouncementFormProps {
  classId: string;
  authorId: string;
}

export function AnnouncementForm({ classId, authorId }: AnnouncementFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<AnnouncementType>("standard");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle || !trimmedContent) {
      setError("Title and content are required.");
      return;
    }
    if (linkUrl && !/^https:\/\//i.test(linkUrl)) {
      setError("Link URL must start with https://");
      return;
    }
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
      setError("Image URL must start with https://");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("announcements").insert({
      class_id: classId,
      author_id: authorId,
      title: trimmedTitle,
      content: trimmedContent,
      type,
      link_title: linkTitle.trim() || null,
      link_url: linkUrl.trim() || null,
      image_url: imageUrl.trim() || null,
      image_alt: imageAlt.trim() || null,
    });
    setIsSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push(`/educator/classes/${classId}`);
    router.refresh();
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
            maxLength={255}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ann-content">Content</Label>
          <textarea
            id="ann-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={6}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            placeholder="Share details, instructions, or context for your students."
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

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ann-image-alt">Image alt text (optional)</Label>
            <Input
              id="ann-image-alt"
              value={imageAlt}
              onChange={(e) => setImageAlt(e.target.value)}
              maxLength={255}
              placeholder="Diagram showing leftward shift"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ann-image-url">Image URL (optional)</Label>
            <Input
              id="ann-image-url"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              pattern="https://.*"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Posting..." : "Post Announcement"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
