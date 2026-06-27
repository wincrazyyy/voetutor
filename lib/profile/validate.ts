/**
 * validateProfileDoc — the single gate shared by the builder save action and the legacy importer.
 *
 * It does two jobs in one pass (plans/educator-profile.md §2 + §0):
 *   1. AUTO-CLEAN — defensively rebuild the doc from known shapes only, dropping empty sections,
 *      empty paragraphs/headings, empty cards/columns/links/services, and normalizing generic
 *      default labels (e.g. "items") to null. This is what guarantees a component never ships blank.
 *   2. VALIDATE — enforce the PROFILE_LIMITS; throw ProfileValidationError on a real violation
 *      (a title that is too long, too many sections, list nesting that is malformed beyond repair).
 *
 * Unknown section/node/mark types are silently dropped (allowlist), mirroring the public renderer.
 */
import {
  EDUCATOR_PROFILE_DOC_VERSION,
  type EducatorProfileDoc,
  type ProfileSection,
  type ProfileSectionType,
  type InlineDoc,
  type InlineBlock,
  type InlineParagraph,
  type InlineNestedList,
  type InlineListItem,
  type InlineListItemL2,
  type InlineLeaf,
  type InlineMark,
  type InlineLinkMark,
  type ResultCard,
  type ListColumn,
  type ImageItem,
  type LinkItem,
  type ServiceItem,
  type ColumnCount,
  type SectionAccent,
} from "@/lib/types/profile-doc";
import { PROFILE_LIMITS } from "./limits";
import { isOwnEducatorAssetUrl } from "./asset-url";
import { ALL_AUTHORABLE_SECTION_TYPES } from "@/lib/tiers/capabilities";

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

const HTTPS = /^https:\/\//i;
const ALLOWED_TYPES = new Set<ProfileSectionType>(ALL_AUTHORABLE_SECTION_TYPES);

function fail(message: string): never {
  throw new ProfileValidationError(message);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function newId(v: unknown): string {
  return typeof v === "string" && v.length > 0 ? v : crypto.randomUUID();
}
function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function capped(s: string, max: number, label: string): string {
  if (s.length > max) fail(`${label} exceeds ${max} characters.`);
  return s;
}
function optText(v: unknown, max: number, label: string): string | null {
  const s = trimStr(v);
  return s ? capped(s, max, label) : null;
}
function optLabel(v: unknown, max: number, label: string): string | null {
  const s = trimStr(v);
  if (!s) return null;
  if ((PROFILE_LIMITS.genericLabels as readonly string[]).includes(s.toLowerCase())) return null;
  return capped(s, max, label);
}
function accentOf(v: unknown): SectionAccent {
  return v === "primary" || v === "gold" ? v : "none";
}
function columnsOf(v: unknown): ColumnCount {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === "auto" ? v : "auto";
}

/* ----- inline rich text ----- */

function cleanMarks(input: unknown): InlineMark[] {
  const simple = new Set<"bold" | "italic" | "underline" | "strike" | "highlight">();
  let link: InlineLinkMark | null = null;
  for (const m of asArray(input)) {
    if (!isObj(m)) continue;
    const t = m.type;
    if (t === "bold" || t === "italic" || t === "underline" || t === "strike" || t === "highlight") {
      simple.add(t);
    } else if (t === "link" && !link) {
      const attrs = isObj(m.attrs) ? m.attrs : {};
      const href = trimStr(attrs.href);
      if (HTTPS.test(href)) {
        link = { type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow" } };
      }
    }
  }
  const out: InlineMark[] = Array.from(simple, (type) => ({ type }) as InlineMark);
  if (link) out.push(link);
  return out;
}

function cleanLeaves(input: unknown): InlineLeaf[] {
  const out: InlineLeaf[] = [];
  for (const n of asArray(input)) {
    if (!isObj(n)) continue;
    if (n.type === "hardBreak") {
      out.push({ type: "hardBreak" });
    } else if (n.type === "text" && typeof n.text === "string" && n.text.length > 0) {
      const marks = cleanMarks(n.marks);
      out.push(marks.length ? { type: "text", text: n.text, marks } : { type: "text", text: n.text });
    }
  }
  while (out.length && out[0].type === "hardBreak") out.shift();
  while (out.length && out[out.length - 1].type === "hardBreak") out.pop();
  return out;
}

/** Depth-2 list: items hold paragraphs only; any deeper nesting is flattened up into this level. */
function collectNestedItems(list: Record<string, unknown>, out: InlineListItemL2[]): void {
  for (const it of asArray(list.content)) {
    if (!isObj(it) || it.type !== "listItem") continue;
    const paras: InlineParagraph[] = [];
    for (const k of asArray(it.content)) {
      if (isObj(k) && k.type === "paragraph") {
        const leaves = cleanLeaves(k.content);
        if (leaves.length) paras.push({ type: "paragraph", content: leaves });
      }
    }
    if (paras.length) out.push({ type: "listItem", content: paras });
    for (const k of asArray(it.content)) {
      if (isObj(k) && (k.type === "bulletList" || k.type === "orderedList")) {
        collectNestedItems(k, out);
      }
    }
  }
}

function cleanNestedList(list: Record<string, unknown>): InlineNestedList | null {
  const items: InlineListItemL2[] = [];
  collectNestedItems(list, items);
  if (!items.length) return null;
  if (list.type === "orderedList") {
    const start = isObj(list.attrs) && typeof list.attrs.start === "number" ? list.attrs.start : undefined;
    return start !== undefined
      ? { type: "orderedList", attrs: { start }, content: items }
      : { type: "orderedList", content: items };
  }
  return { type: "bulletList", content: items };
}

function cleanTopListItem(input: unknown): InlineListItem | null {
  if (!isObj(input) || input.type !== "listItem") return null;
  const content: (InlineParagraph | InlineNestedList)[] = [];
  for (const k of asArray(input.content)) {
    if (!isObj(k)) continue;
    if (k.type === "paragraph") {
      const leaves = cleanLeaves(k.content);
      if (leaves.length) content.push({ type: "paragraph", content: leaves });
    } else if (k.type === "bulletList" || k.type === "orderedList") {
      const nested = cleanNestedList(k);
      if (nested) content.push(nested);
    }
  }
  return content.length ? { type: "listItem", content } : null;
}

function cleanTopList(list: Record<string, unknown>): InlineBlock | null {
  const items: InlineListItem[] = [];
  for (const it of asArray(list.content)) {
    const ci = cleanTopListItem(it);
    if (ci) items.push(ci);
  }
  if (!items.length) return null;
  if (list.type === "orderedList") {
    const start = isObj(list.attrs) && typeof list.attrs.start === "number" ? list.attrs.start : undefined;
    return start !== undefined
      ? { type: "orderedList", attrs: { start }, content: items }
      : { type: "orderedList", content: items };
  }
  return { type: "bulletList", content: items };
}

function isEmptyPara(b: InlineBlock): boolean {
  return b.type === "paragraph" && !(b.content && b.content.length > 0);
}

function collapseParagraphs(blocks: InlineBlock[]): InlineBlock[] {
  const out: InlineBlock[] = [];
  for (const b of blocks) {
    if (isEmptyPara(b)) {
      if (out.length === 0) continue;
      if (isEmptyPara(out[out.length - 1])) continue;
    }
    out.push(b);
  }
  while (out.length && isEmptyPara(out[out.length - 1])) out.pop();
  return out;
}

function countTextChars(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n: number, x) => n + countTextChars(x), 0);
  if (isObj(node)) {
    let n = 0;
    if (node.type === "text" && typeof node.text === "string") n += node.text.length;
    if (Array.isArray(node.content)) n += countTextChars(node.content);
    return n;
  }
  return 0;
}

function cleanInlineDoc(input: unknown): InlineDoc {
  const blocks: InlineBlock[] = [];
  const raw = isObj(input) ? input.content : undefined;
  for (const b of asArray(raw)) {
    if (!isObj(b)) continue;
    if (b.type === "paragraph") {
      blocks.push({ type: "paragraph", content: cleanLeaves(b.content) });
    } else if (b.type === "bulletList" || b.type === "orderedList") {
      const list = cleanTopList(b);
      if (list) blocks.push(list);
    }
  }
  const collapsed = collapseParagraphs(blocks);
  if (collapsed.length > PROFILE_LIMITS.text.maxBlocks) {
    fail(`A text section has too many blocks (max ${PROFILE_LIMITS.text.maxBlocks}).`);
  }
  if (countTextChars(collapsed) > PROFILE_LIMITS.text.maxChars) {
    fail(`A text section exceeds ${PROFILE_LIMITS.text.maxChars} characters.`);
  }
  return { type: "doc", content: collapsed };
}

/* ----- cards / columns / images / links / services ----- */

function cleanResultCard(input: unknown): ResultCard | null {
  if (!isObj(input)) return null;
  const value = capped(trimStr(input.value), PROFILE_LIMITS.results.valueMax, "Grade");
  if (!value) return null;
  const title = capped(trimStr(input.title), PROFILE_LIMITS.results.titleMax, "Subject");
  if (!title) return null;
  const helper = optText(input.helper, PROFILE_LIMITS.results.helperMax, "Detail");
  return { id: newId(input.id), kind: "result", title, value, helper };
}

function cleanListColumn(input: unknown): ListColumn | null {
  if (!isObj(input)) return null;
  const items = asArray(input.items)
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((s) => s.length > 0)
    .slice(0, PROFILE_LIMITS.lists.maxPillsPerColumn)
    .map((s) => capped(s, PROFILE_LIMITS.lists.pillMax, "List item"));
  if (!items.length) return null;
  return {
    id: newId(input.id),
    kind: "list",
    title: optText(input.title, PROFILE_LIMITS.section.titleMax, "List title"),
    items,
    countLabel: optLabel(input.countLabel, PROFILE_LIMITS.lists.countLabelMax, "Unit label"),
  };
}

function cleanImage(input: unknown, educatorId?: string): ImageItem | null {
  if (!isObj(input)) return null;
  const rawUrl = trimStr(input.url);
  /* When an educatorId is supplied (server-side save), origin-pin the URL the same way the renderer
     does — a URL that is not under this educator's own storage prefix is blanked, never persisted, so
     a hand-crafted profile_doc can't smuggle an off-origin/other-educator image past the API. The
     client preview calls without an educatorId, so it leaves freshly-uploaded URLs intact. */
  const url = !rawUrl ? "" : educatorId ? (isOwnEducatorAssetUrl(rawUrl, educatorId) ? rawUrl : "") : rawUrl;
  const origAlt = trimStr(input.alt);
  const caption = optText(input.caption, PROFILE_LIMITS.photos.captionMax, "Caption");
  if (!url && !origAlt && !caption) return null;
  const alt = capped(origAlt || caption || "Image", PROFILE_LIMITS.photos.altMax, "Image description");
  return { id: newId(input.id), url, alt, caption };
}

function cleanLink(input: unknown): LinkItem | null {
  if (!isObj(input)) return null;
  const url = trimStr(input.url);
  if (!HTTPS.test(url)) return null;
  const label = optText(input.label, PROFILE_LIMITS.links.labelMax, "Link label") ?? url;
  return { id: newId(input.id), label, url };
}

function cleanService(input: unknown): ServiceItem | null {
  if (!isObj(input)) return null;
  const name = capped(trimStr(input.name), PROFILE_LIMITS.services.nameMax, "Service name");
  if (!name) return null;
  return {
    id: newId(input.id),
    name,
    priceLabel: optText(input.priceLabel, PROFILE_LIMITS.services.priceLabelMax, "Price"),
    wasPriceLabel: optText(input.wasPriceLabel, PROFILE_LIMITS.services.priceLabelMax, "Original price"),
    description: optText(input.description, PROFILE_LIMITS.services.descriptionMax, "Service description"),
  };
}

function filterNonNull<T>(arr: (T | null)[]): T[] {
  return arr.filter((x): x is T => x !== null);
}

function cleanSection(input: unknown, educatorId?: string): ProfileSection | null {
  if (!isObj(input) || typeof input.type !== "string") return null;
  if (!ALLOWED_TYPES.has(input.type as ProfileSectionType)) return null;
  const base = {
    id: newId(input.id),
    title: optText(input.title, PROFILE_LIMITS.section.titleMax, "Section title"),
    accent: accentOf(input.accent),
  };
  switch (input.type as ProfileSectionType) {
    case "text": {
      const body = cleanInlineDoc(input.body);
      if (body.content.length === 0) return null;
      return { ...base, type: "text", body };
    }
    case "results": {
      const cards = filterNonNull(asArray(input.cards).map(cleanResultCard));
      if (!cards.length) return null;
      if (cards.length > PROFILE_LIMITS.results.maxCards) fail(`A results section has too many cards (max ${PROFILE_LIMITS.results.maxCards}).`);
      return { ...base, type: "results", columns: columnsOf(input.columns), cards };
    }
    case "lists": {
      const lists = filterNonNull(asArray(input.lists).map(cleanListColumn));
      if (!lists.length) return null;
      if (lists.length > PROFILE_LIMITS.lists.maxColumns) fail(`A lists section has too many columns (max ${PROFILE_LIMITS.lists.maxColumns}).`);
      return { ...base, type: "lists", columns: columnsOf(input.columns), lists };
    }
    case "photos": {
      const images = filterNonNull(asArray(input.images).map((x) => cleanImage(x, educatorId)));
      if (!images.length) return null;
      if (images.length > PROFILE_LIMITS.photos.maxImages) fail(`A photos section has too many images (max ${PROFILE_LIMITS.photos.maxImages}).`);
      return { ...base, type: "photos", columns: columnsOf(input.columns), images };
    }
    case "links": {
      const links = filterNonNull(asArray(input.links).map(cleanLink));
      if (!links.length) return null;
      if (links.length > PROFILE_LIMITS.links.maxLinks) fail(`A links section has too many links (max ${PROFILE_LIMITS.links.maxLinks}).`);
      return { ...base, type: "links", links };
    }
    case "services": {
      const items = filterNonNull(asArray(input.items).map(cleanService));
      if (!items.length) return null;
      if (items.length > PROFILE_LIMITS.services.maxItems) fail(`A services section has too many items (max ${PROFILE_LIMITS.services.maxItems}).`);
      return { ...base, type: "services", items };
    }
    default:
      return null;
  }
}

/**
 * Clean + validate an untrusted profile document. Throws ProfileValidationError on a real violation.
 * Pass `educatorId` (server-side save / import) to origin-pin every image URL to that educator's own
 * storage prefix; omit it (client preview) to leave URLs untouched.
 */
export function validateProfileDoc(
  input: unknown,
  educatorId?: string,
  opts?: { maxImages?: number },
): EducatorProfileDoc {
  if (!isObj(input)) fail("Profile document must be an object.");
  const sections = filterNonNull(asArray(input.sections).map((s) => cleanSection(s, educatorId)));
  if (sections.length > PROFILE_LIMITS.maxSections) {
    fail(`Profile has too many sections (max ${PROFILE_LIMITS.maxSections}).`);
  }
  /* Total photos across the whole profile (storage-cost ceiling), separate from the per-section cap.
     Enforced only when a cap is supplied (server-side save / import); the client preview omits it. */
  if (opts?.maxImages != null) {
    const totalImages = sections.reduce(
      (n, s) => n + (s.type === "photos" ? s.images.filter((im) => im.url).length : 0),
      0,
    );
    if (totalImages > opts.maxImages) {
      fail(`Profile has too many photos (max ${opts.maxImages} across all sections).`);
    }
  }
  const doc: EducatorProfileDoc = { version: EDUCATOR_PROFILE_DOC_VERSION, sections };
  const bytes = new TextEncoder().encode(JSON.stringify(doc)).length;
  if (bytes > PROFILE_LIMITS.maxDocBytes) {
    fail(`Profile document is too large (max ${Math.floor(PROFILE_LIMITS.maxDocBytes / 1024)} KB).`);
  }
  return doc;
}
