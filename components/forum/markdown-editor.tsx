"use client";

import { useRef, useState } from "react";
import { Bold, Code, ImagePlus, Italic, Link2, List, Quote } from "lucide-react";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { ForumMarkdown } from "@/components/forum/forum-markdown";
import { uploadRteImage } from "@/lib/forum/rte-image";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  autoFocus?: boolean;
  id?: string;
  /** Current user's id — enables the image-embed button (uploads to rte-images/{uploaderId}/...). */
  uploaderId?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minRows = 4,
  autoFocus = false,
  id,
  uploaderId,
}: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  const restore = (selStart: number, selEnd: number) => {
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    });
  };

  const wrap = (before: string, after: string = before) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    restore(start + before.length, start + before.length + selected.length);
  };

  const prefixLines = (prefix: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const block = value.slice(lineStart, end);
    const prefixed = block
      .split("\n")
      .map((line) => prefix + line)
      .join("\n");
    const next = value.slice(0, lineStart) + prefixed + value.slice(end);
    onChange(next);
    restore(lineStart, lineStart + prefixed.length);
  };

  const insertLink = () => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || "text";
    const snippet = `[${selected}](https://)`;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    const urlPos = start + selected.length + 3;
    restore(urlPos, urlPos + 8);
  };

  const insertAtCaret = (text: string) => {
    const ta = ref.current;
    if (!ta) {
      onChange(value + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    restore(start + text.length, start + text.length);
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploaderId) return;
    setImgError(null);
    setUploading(true);
    const res = await uploadRteImage(file, uploaderId);
    setUploading(false);
    if (res.error || !res.url) {
      setImgError(res.error ?? "Image upload failed.");
      return;
    }
    insertAtCaret(`\n![image](${res.url})\n`);
  };

  const tools = [
    { label: "Bold", icon: Bold, run: () => wrap("**") },
    { label: "Italic", icon: Italic, run: () => wrap("*") },
    { label: "Link", icon: Link2, run: insertLink },
    { label: "Bulleted list", icon: List, run: () => prefixLines("- ") },
    { label: "Quote", icon: Quote, run: () => prefixLines("> ") },
    { label: "Inline code", icon: Code, run: () => wrap("`") },
  ];

  return (
    <div className="rounded-md border border-input bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
        <div className="flex items-center gap-0.5">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.label}
                type="button"
                title={t.label}
                aria-label={t.label}
                onClick={t.run}
                disabled={tab === "preview"}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
          {uploaderId && (
            <>
              <button
                type="button"
                title="Embed image"
                aria-label="Embed image"
                onClick={() => fileRef.current?.click()}
                disabled={tab === "preview" || uploading}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {uploading ? <Spinner className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onPickImage}
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTab("write")}
            className={cn("rounded px-2 py-1 font-medium", tab === "write" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={cn("rounded px-2 py-1 font-medium", tab === "preview" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Preview
          </button>
        </div>
      </div>

      {tab === "write" ? (
        <textarea
          ref={ref}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={minRows}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="w-full resize-y bg-transparent px-3 py-2 text-sm outline-none"
        />
      ) : (
        <div className="min-h-[6rem] px-3 py-2">
          {value.trim() ? (
            <ForumMarkdown content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview.</p>
          )}
        </div>
      )}

      {imgError && <p className="border-t border-border px-3 py-1 text-xs text-destructive">{imgError}</p>}

      <div className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
        Markdown supported — **bold**, *italic*, lists, `code`, &gt; quotes, [links](url), and image embeds
      </div>
    </div>
  );
}
