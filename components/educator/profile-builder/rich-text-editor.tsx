"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Link2,
  List as ListIcon,
  ListOrdered,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROFILE_LIMITS } from "@/lib/profile/limits";
import type { InlineDoc } from "@/lib/types/profile-doc";

/**
 * The ONLY rich-text surface (inside `text` sections). StarterKit with headings / code / quotes /
 * rules disabled (not in the allowlist) — it already bundles Link + Underline in v3, so those are
 * configured here, not added separately. Highlight is single-colour; the validator normalizes the
 * output on save regardless. Links are inserted via an inline panel (no native window.prompt).
 */
const CONTENT_CLASS = cn(
  "min-h-24 rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed md:text-sm",
  "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_a]:text-primary [&_a]:underline [&_mark]:rounded-sm [&_mark]:bg-[hsl(var(--accent-gold)/0.3)] [&_mark]:px-0.5",
);

const HTTPS = /^https:\/\//i;

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex size-10 items-center justify-center rounded-md text-muted-foreground ring-offset-background transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:size-7",
        active && "bg-background text-primary",
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
}: {
  value: InlineDoc;
  onChange: (doc: InlineDoc) => void;
}) {
  /* TipTap captures the onUpdate closure once at creation; route through a ref so each update uses
     the latest onChange (which closes over the latest section title/accent) — without it, editing the
     body after changing the title would revert the title to its stale snapshot. */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: false,
          protocols: ["https"],
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Highlight.configure({ multicolor: false }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: { attributes: { class: CONTENT_CLASS } },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON() as unknown as InlineDoc),
  });

  if (!editor) {
    return <div className="min-h-24 rounded-md border border-input bg-background" aria-hidden />;
  }

  const linkActive = editor.isActive("link");

  const openLinkPanel = () => {
    if (linkOpen) {
      setLinkOpen(false);
      return;
    }
    const previous = editor.getAttributes("link").href as string | undefined;
    setLinkUrl(previous && previous.trim() ? previous : "https://");
    setLinkOpen(true);
  };

  const applyLink = () => {
    const trimmed = linkUrl.trim();
    if (!HTTPS.test(trimmed)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    setLinkOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  };

  const closeLinkPanel = () => {
    setLinkOpen(false);
    editor.chain().focus().run();
  };

  const trimmedUrl = linkUrl.trim();
  const linkValid = HTTPS.test(trimmedUrl);
  const linkInvalid = trimmedUrl !== "" && !linkValid && !"https://".startsWith(trimmedUrl.toLowerCase());

  const chars = editor.getText().length;
  const overLimit = chars > PROFILE_LIMITS.text.maxChars;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-muted/40 p-1">
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <BoldIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <ItalicIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
          <Highlighter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Link" active={linkActive || linkOpen} onClick={openLinkPanel}>
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <ListIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {linkOpen ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              autoFocus
              value={linkUrl}
              aria-label="Link URL"
              aria-invalid={linkInvalid}
              placeholder="https://"
              className="h-10 min-w-0 flex-1 sm:h-8"
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  closeLinkPanel();
                }
              }}
            />
            <Button type="button" size="sm" onClick={applyLink} disabled={!linkValid}>
              Apply
            </Button>
            {linkActive ? (
              <Button type="button" size="sm" variant="ghost" onClick={removeLink}>
                Remove link
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={closeLinkPanel}>
              Cancel
            </Button>
          </div>
          <p className={cn("text-xs", linkInvalid ? "text-destructive" : "text-muted-foreground")}>
            {linkInvalid ? "Add https:// to the front of the address." : "Links must start with https://"}
          </p>
        </div>
      ) : null}

      <EditorContent editor={editor} />
      <div className={cn("text-right text-xs", overLimit ? "text-destructive" : "text-muted-foreground")}>
        {chars.toLocaleString()} / {PROFILE_LIMITS.text.maxChars.toLocaleString()} characters
      </div>
    </div>
  );
}
