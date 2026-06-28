import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";
import { isRteImageUrl } from "@/lib/forum/rte-image";

interface ForumMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Safe markdown renderer for forum posts/replies. react-markdown builds React elements from an AST — it
 * does NOT use dangerouslySetInnerHTML and does NOT render raw HTML (no rehype-raw), so user content can't
 * inject markup. Links are restricted to safe protocols (react-markdown's default urlTransform) and open in
 * a new tab. `#mention-<id>` links render as a styled, non-navigating mention chip — so once the @-mention
 * picker lands, mentions already render here with zero extra render work. Images are disallowed.
 */
const COMPONENTS: Components = {
  a({ href, children }) {
    if (href && href.startsWith("#mention-")) {
      return (
        <span className="rounded bg-primary/10 px-1 font-medium text-primary">{children}</span>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-primary underline underline-offset-2 hover:no-underline"
      >
        {children}
      </a>
    );
  },
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 last:mb-0 list-disc pl-5 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 last:mb-0 list-decimal pl-5 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 last:mb-0 border-l-2 border-border pl-3 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  code: ({ className: cls, children }) => {
    const isBlock = (cls ?? "").includes("language-");
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{children}</code>
      );
    }
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>;
  },
  pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
  h1: ({ children }) => <h3 className="mb-2 mt-1 text-base font-bold">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-1 text-base font-bold">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1.5 mt-1 text-sm font-bold">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  hr: () => <hr className="my-3 border-border" />,
  table: ({ children }) => (
    <div className="mb-2 last:mb-0 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
  img({ src, alt }) {
    /* Only render images we host (origin-pinned to the rte-images bucket); an arbitrary external
       `![](url)` is dropped, so embeds can't smuggle tracking pixels or mixed content. */
    if (typeof src !== "string" || !isRteImageUrl(src)) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        className="my-2 max-h-96 w-auto max-w-full rounded-md border border-border"
      />
    );
  },
};

export function ForumMarkdown({ content, className }: ForumMarkdownProps) {
  return (
    <div className={cn("text-sm text-foreground/90 break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
