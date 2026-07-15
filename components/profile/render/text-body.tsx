import type { ReactNode } from "react";
import type {
  InlineDoc,
  InlineBlock,
  InlineListItem,
  InlineLeaf,
  InlineMark,
} from "@/lib/types/profile-doc";

const HTTPS = /^https:\/\//i;

/**
 * Renders a `text` section's InlineDoc. Pure allowlist: only known block / leaf / mark types emit
 * React, everything else is dropped. No dangerouslySetInnerHTML, no HTML strings — there is no
 * injection sink to sanitize.
 */
export function TextBody({ doc }: { doc: InlineDoc }) {
  if (!doc || doc.type !== "doc" || !Array.isArray(doc.content)) return null;
  return (
    <div className="space-y-3 break-words text-base leading-relaxed text-foreground/90 sm:text-lg">
      {doc.content.map(renderBlock)}
    </div>
  );
}

function renderBlock(block: InlineBlock, i: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      if (!block.content?.length) return <div key={i} className="h-2" aria-hidden />;
      return <p key={i}>{block.content.map(renderLeaf)}</p>;
    case "bulletList":
      return (
        <ul key={i} className="list-disc space-y-1 pl-5">
          {block.content.map(renderListItem)}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={i} start={block.attrs?.start ?? 1} className="list-decimal space-y-1 pl-5">
          {block.content.map(renderListItem)}
        </ol>
      );
    default:
      return null;
  }
}

function renderListItem(li: InlineListItem, j: number): ReactNode {
  return (
    <li key={j}>
      {li.content.map((child, k) =>
        child.type === "paragraph" ? (
          <span key={k}>{child.content?.map(renderLeaf) ?? null}</span>
        ) : (
          renderBlock(child, k)
        ),
      )}
    </li>
  );
}

function renderLeaf(leaf: InlineLeaf, i: number): ReactNode {
  if (leaf.type === "hardBreak") return <br key={i} />;
  if (leaf.type !== "text" || typeof leaf.text !== "string") return null;
  let node: ReactNode = leaf.text;
  for (const mark of leaf.marks ?? []) node = applyMark(mark, node, i);
  return <span key={i}>{node}</span>;
}

function applyMark(mark: InlineMark, child: ReactNode, key: number): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong key={`b${key}`}>{child}</strong>;
    case "italic":
      return <em key={`i${key}`}>{child}</em>;
    case "underline":
      return <u key={`u${key}`}>{child}</u>;
    case "strike":
      return <s key={`s${key}`}>{child}</s>;
    case "highlight":
      return (
        <mark key={`h${key}`} className="rounded-sm bg-[hsl(var(--accent-gold)/0.30)] px-0.5 text-foreground">
          {child}
        </mark>
      );
    case "link": {
      const href = (mark.attrs?.href ?? "").trim();
      if (!HTTPS.test(href)) return child;
      return (
        <a
          key={`a${key}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {child}
        </a>
      );
    }
    default:
      return child;
  }
}
