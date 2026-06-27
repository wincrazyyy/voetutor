/**
 * One-pass importer: a legacy Vault-of-Excellence profile export -> a clean EducatorProfileDoc.
 *
 * The importer only handles STRUCTURE (split an `rte` module's headings into separate text sections,
 * map `grid`/`miniCard` -> results/lists, `image` -> photos, drop `divider`). It deliberately leaves
 * inline-mark normalization (highlight colour -> single accent, link attrs, depth, empties, generic
 * labels) to validateProfileDoc, which every save also runs — one source of truth. See §11.
 *
 * Legacy images live on the old project's Storage host and fail the new origin check, so their URL is
 * left empty (flagged "re-upload required") for manual re-upload. See plans/educator-profile.md §7.
 */
import { validateProfileDoc } from "./validate";
import { EDUCATOR_PROFILE_DOC_VERSION, type EducatorProfileDoc } from "@/lib/types/profile-doc";

type AnyObj = Record<string, unknown>;

function isObj(v: unknown): v is AnyObj {
  return typeof v === "object" && v !== null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function rid(): string {
  return crypto.randomUUID();
}

function textOf(nodes: unknown): string {
  let s = "";
  for (const n of arr(nodes)) {
    if (!isObj(n)) continue;
    if (n.type === "text" && typeof n.text === "string") s += n.text;
    else if (Array.isArray(n.content)) s += textOf(n.content);
  }
  return s;
}

/** Legacy highlight colour on a heading -> our structured accent enum. Yellow -> gold, rest -> primary. */
function headingAccent(heading: AnyObj): "none" | "primary" | "gold" {
  for (const t of arr(heading.content)) {
    if (!isObj(t)) continue;
    for (const m of arr(t.marks)) {
      if (isObj(m) && m.type === "highlight" && isObj(m.attrs)) {
        return String(m.attrs.color ?? "").includes("yellow") ? "gold" : "primary";
      }
    }
  }
  return "none";
}

/** Split one `rte` doc into N text sections: each heading starts a fresh section; the rest is body. */
function splitRteIntoSections(doc: unknown): unknown[] {
  const content = isObj(doc) ? arr(doc.content) : [];
  const sections: AnyObj[] = [];

  const pushBlock = (node: unknown) => {
    let target = sections[sections.length - 1];
    if (!target || target.type !== "text") {
      target = { id: rid(), type: "text", title: null, accent: "none", body: { type: "doc", content: [] as unknown[] } };
      sections.push(target);
    }
    ((target.body as AnyObj).content as unknown[]).push(node);
  };

  for (const node of content) {
    if (!isObj(node)) continue;
    if (node.type === "heading") {
      const title = textOf(node.content).trim().replace(/:\s*$/, "");
      sections.push({
        id: rid(),
        type: "text",
        title: title || null,
        accent: headingAccent(node),
        body: { type: "doc", content: [] as unknown[] },
      });
    } else {
      pushBlock(node);
    }
  }
  return sections;
}

function cardFrom(content: AnyObj): AnyObj | null {
  if (content.kind === "value") {
    return { id: rid(), kind: "result", title: content.title, value: content.value, helper: content.helper };
  }
  return null;
}
function columnFrom(content: AnyObj): AnyObj | null {
  if (content.kind === "tags") {
    return { id: rid(), kind: "list", title: content.title, items: content.items, countLabel: content.countLabel };
  }
  return null;
}

/** A legacy `grid` -> a results OR lists section (by the miniCards' kind). Placement/spans are dropped. */
function gridToSection(content: unknown): unknown | null {
  if (!isObj(content)) return null;
  const columns = typeof content.columns === "number" ? content.columns : "auto";
  const cards: unknown[] = [];
  const lists: unknown[] = [];
  for (const it of arr(content.items)) {
    if (!isObj(it)) continue;
    const mod = isObj(it.module) ? it.module : it;
    const c = isObj(mod.content) ? mod.content : null;
    if (!c) continue;
    const card = cardFrom(c);
    if (card) {
      cards.push(card);
      continue;
    }
    const col = columnFrom(c);
    if (col) lists.push(col);
  }
  if (cards.length) return { id: rid(), type: "results", columns, cards };
  if (lists.length) return { id: rid(), type: "lists", columns, lists };
  return null;
}

/** A standalone `miniCard` (not inside a grid) -> a single-card results / single-column lists section. */
function miniCardToSection(content: unknown): unknown | null {
  if (!isObj(content)) return null;
  const card = cardFrom(content);
  if (card) return { id: rid(), type: "results", columns: 1, cards: [card] };
  const col = columnFrom(content);
  if (col) return { id: rid(), type: "lists", columns: 1, lists: [col] };
  return null;
}

function imageToSection(content: unknown): unknown | null {
  if (!isObj(content)) return null;
  const caption = typeof content.caption === "string" && content.caption.trim() ? content.caption.trim() : null;
  const altRaw = typeof content.alt === "string" ? content.alt.trim() : "";
  const alt = altRaw || caption || "Image";
  return {
    id: rid(),
    type: "photos",
    columns: 1,
    images: [{ id: rid(), url: "", alt: `${alt} (re-upload required)`, caption }],
  };
}

/** True if a built text section actually carries text (vs a heading-only / empty body). */
function bodyHasText(section: AnyObj): boolean {
  const body = isObj(section.body) ? section.body : null;
  return body ? textOf(body.content).trim().length > 0 : false;
}

export function importLegacyProfile(legacy: unknown): EducatorProfileDoc {
  const sections: unknown[] = [];
  for (const sec of arr(legacy)) {
    if (!isObj(sec)) continue;
    for (const mod of arr(sec.modules)) {
      if (!isObj(mod)) continue;
      switch (mod.type) {
        case "rte":
          sections.push(...splitRteIntoSections(isObj(mod.content) ? mod.content.doc : undefined));
          break;
        case "grid": {
          const s = gridToSection(mod.content);
          if (s) sections.push(s);
          break;
        }
        case "miniCard": {
          const s = miniCardToSection(mod.content);
          if (s) sections.push(s);
          break;
        }
        case "image": {
          const s = imageToSection(mod.content);
          if (s) sections.push(s);
          break;
        }
        default:
          break;
      }
    }
  }
  /* Attach an orphan trailing heading (e.g. "Public Exam Results:") to the content section that
     follows it, so the heading's label + accent are not lost when its empty text body is dropped. */
  const merged: unknown[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (isObj(s) && s.type === "text" && !bodyHasText(s) && s.title) {
      const next = sections[i + 1];
      if (isObj(next) && (next.type === "results" || next.type === "lists" || next.type === "photos") && !next.title) {
        next.title = s.title;
        next.accent = s.accent;
        continue;
      }
    }
    merged.push(s);
  }
  return validateProfileDoc({ version: EDUCATOR_PROFILE_DOC_VERSION, sections: merged });
}
