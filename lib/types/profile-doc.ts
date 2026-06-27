/**
 * Educator public-profile content model — the versioned body document.
 *
 * Structured, theme-locked sections (NOT a freeform node soup). See plans/educator-profile.md §2.
 * The header / identity fields are typed DB columns, not part of this doc — the doc is only the
 * flexible body. The only rich-text surface is the small InlineDoc used inside `text` sections.
 *
 * Section `type` discriminants are the user-facing names (text / results / lists / photos / links /
 * services), so the stored JSON, the code, and the builder UI all read the same.
 */

export const EDUCATOR_PROFILE_DOC_VERSION = 1 as const;

/* ----- Inline rich text: the ONLY rich-text surface (lives inside `text` sections) ----- */

export interface InlineLinkMark {
  type: "link";
  attrs: { href: string; target: "_blank"; rel: "noopener noreferrer nofollow" };
}

/**
 * Emphasis marks. Deliberately small + theme-locked: bold / italic / underline / strike are
 * monochrome; `highlight` carries NO colour attr — it is the single theme-locked accent (one
 * colour, never a picker). The legacy multi-colour highlight is what produced the "ransom-note"
 * pages, so colour is not authorable.
 */
export type InlineMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "highlight" }
  | InlineLinkMark;

export interface InlineText {
  type: "text";
  text: string;
  marks?: InlineMark[];
}
export interface InlineHardBreak {
  type: "hardBreak";
}
export type InlineLeaf = InlineText | InlineHardBreak;

export interface InlineParagraph {
  type: "paragraph";
  content?: InlineLeaf[];
}

/* Lists nest at most TWO levels; the L2 types cannot nest further (the type system caps depth). */
export interface InlineListItemL2 {
  type: "listItem";
  content: InlineParagraph[];
}
export interface InlineBulletListL2 {
  type: "bulletList";
  content: InlineListItemL2[];
}
export interface InlineOrderedListL2 {
  type: "orderedList";
  attrs?: { start?: number };
  content: InlineListItemL2[];
}
export type InlineNestedList = InlineBulletListL2 | InlineOrderedListL2;

export interface InlineListItem {
  type: "listItem";
  content: (InlineParagraph | InlineNestedList)[];
}
export interface InlineBulletList {
  type: "bulletList";
  content: InlineListItem[];
}
export interface InlineOrderedList {
  type: "orderedList";
  attrs?: { start?: number };
  content: InlineListItem[];
}
export type InlineBlock = InlineParagraph | InlineBulletList | InlineOrderedList;

export interface InlineDoc {
  type: "doc";
  content: InlineBlock[];
}
export const EMPTY_INLINE_DOC: InlineDoc = { type: "doc", content: [] };

/* ----- Sections ----- */

/** Structured section accent — replaces the legacy inline highlight on titles. Theme-locked enum. */
export type SectionAccent = "none" | "primary" | "gold";

/** Layout: a tiny enum. The educator picks "how many across"; the renderer makes it responsive. */
export type ColumnCount = 1 | 2 | 3 | 4 | "auto";

/** A single exam-result card inside a `results` section. UI labels: Subject/Exam · Grade · Detail. */
export interface ResultCard {
  id: string;
  kind: "result";
  title: string;
  value: string;
  helper?: string | null;
}
/** A single titled pill column inside a `lists` section. */
export interface ListColumn {
  id: string;
  kind: "list";
  title?: string | null;
  items: string[];
  countLabel?: string | null;
}
export interface ImageItem {
  id: string;
  url: string;
  alt: string;
  caption?: string | null;
}
export interface LinkItem {
  id: string;
  label: string;
  url: string;
}
export interface ServiceItem {
  id: string;
  name: string;
  priceLabel?: string | null;
  wasPriceLabel?: string | null;
  description?: string | null;
}

interface SectionBase {
  id: string;
  title?: string | null;
  accent?: SectionAccent;
}

/** Free text: bullets / numbered lists (<=2 levels) + paragraphs with bold / italic / underline / strike / link + one accent highlight. */
export interface TextSection extends SectionBase {
  type: "text";
  body: InlineDoc;
}
/** Row of exam-result cards. */
export interface ResultsSection extends SectionBase {
  type: "results";
  columns: ColumnCount;
  cards: ResultCard[];
}
/** Titled pill columns (courses / schools / skills). */
export interface ListsSection extends SectionBase {
  type: "lists";
  columns: ColumnCount;
  lists: ListColumn[];
}
/** One or more images with optional captions. */
export interface PhotosSection extends SectionBase {
  type: "photos";
  columns: ColumnCount;
  images: ImageItem[];
}
/** Labelled external links (Website / Instagram / press). */
export interface LinksSection extends SectionBase {
  type: "links";
  links: LinkItem[];
}
/** Display-only services & pricing (no checkout — that is the deferred Stripe phase). */
export interface ServicesSection extends SectionBase {
  type: "services";
  items: ServiceItem[];
}

export type ProfileSection =
  | TextSection
  | ResultsSection
  | ListsSection
  | PhotosSection
  | LinksSection
  | ServicesSection;

export type ProfileSectionType = ProfileSection["type"];

export interface EducatorProfileDoc {
  version: typeof EDUCATOR_PROFILE_DOC_VERSION;
  sections: ProfileSection[];
}
export const EMPTY_EDUCATOR_PROFILE_DOC: EducatorProfileDoc = {
  version: EDUCATOR_PROFILE_DOC_VERSION,
  sections: [],
};
