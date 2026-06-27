import type { InlineDoc, ProfileSection } from "@/lib/types/profile-doc";

type LooseNode = { type?: string; text?: string; content?: unknown };

function countWords(body: InlineDoc): number {
  const acc: string[] = [];
  const walk = (nodes: LooseNode[]) => {
    for (const n of nodes) {
      if (n.type === "text" && typeof n.text === "string") acc.push(n.text);
      if (Array.isArray(n.content)) walk(n.content as LooseNode[]);
    }
  };
  if (body && Array.isArray(body.content)) walk(body.content as LooseNode[]);
  const joined = acc.join(" ").trim();
  return joined ? joined.split(/\s+/).length : 0;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const EMPTY = "Empty — open to fill";

/**
 * One-line plain-text digest of a section's current content for the collapsed-card view. Computed
 * from live builder state, NOT a render of the public component, so a half-filled section never
 * reads as "the tool is glitching".
 */
export function summarizeSection(section: ProfileSection): string {
  switch (section.type) {
    case "text": {
      const n = countWords(section.body);
      return n ? plural(n, "word") : EMPTY;
    }
    case "results": {
      const n = section.cards.filter((c) => c.value.trim() || c.title.trim()).length;
      return n ? plural(n, "result") : EMPTY;
    }
    case "lists": {
      const items = section.lists.reduce((a, c) => a + c.items.filter((i) => i.trim()).length, 0);
      const cols = section.lists.filter((c) => c.items.some((i) => i.trim()) || c.title?.trim()).length;
      return items ? `${plural(items, "item")} · ${plural(cols, "column")}` : EMPTY;
    }
    case "links": {
      const n = section.links.filter((l) => l.url.trim() || l.label.trim()).length;
      return n ? plural(n, "link") : EMPTY;
    }
    case "services": {
      const n = section.items.filter((s) => s.name.trim()).length;
      return n ? plural(n, "service") : EMPTY;
    }
    case "photos": {
      const n = section.images.length;
      return n ? plural(n, "photo") : EMPTY;
    }
    default:
      return "";
  }
}
