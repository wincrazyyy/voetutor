/**
 * Builder-side helpers: the picker catalog (friendly, use-case names) and section factories.
 *
 * New sections are created with ONE empty item so the form is immediately fillable — not pre-filled
 * placeholder *content* (which would ship as the legacy "Tell us something…" default). Anything left
 * empty is auto-cleaned away on save by validateProfileDoc, so an unfilled section never goes public.
 */
import {
  EDUCATOR_PROFILE_DOC_VERSION,
  type EducatorProfileDoc,
  type ProfileSection,
  type ProfileSectionType,
} from "@/lib/types/profile-doc";

export function uid(): string {
  return crypto.randomUUID();
}

export interface SectionTypeMeta {
  type: ProfileSectionType;
  label: string;
  description: string;
  example: string;
}

export const SECTION_CATALOG: SectionTypeMeta[] = [
  {
    type: "text",
    label: "Text",
    description: "A write-up about you and your teaching.",
    example: "e.g. your bio",
  },
  {
    type: "results",
    label: "Results",
    description: "Exam grades your students earned.",
    example: "e.g. IB Math AA HL — 7",
  },
  {
    type: "lists",
    label: "Lists",
    description: "Tidy columns of short items.",
    example: "e.g. courses you teach",
  },
  {
    type: "photos",
    label: "Photos",
    description: "A small gallery of images.",
    example: "e.g. you teaching, your workspace",
  },
  {
    type: "links",
    label: "Links",
    description: "Buttons to your website or socials.",
    example: "e.g. your Instagram",
  },
  {
    type: "services",
    label: "Services & Pricing",
    description: "What you offer, with prices.",
    example: "e.g. 1-on-1 — HK$800/hr",
  },
];

export function createSection(type: ProfileSectionType): ProfileSection {
  const base = { id: uid(), title: null as string | null, accent: "none" as const };
  switch (type) {
    case "results":
      return {
        ...base,
        type: "results",
        columns: 3,
        cards: [{ id: uid(), kind: "result", title: "", value: "", helper: null }],
      };
    case "lists":
      return {
        ...base,
        type: "lists",
        columns: 3,
        lists: [{ id: uid(), kind: "list", title: null, items: [], countLabel: null }],
      };
    case "links":
      return { ...base, type: "links", links: [{ id: uid(), label: "", url: "" }] };
    case "services":
      return {
        ...base,
        type: "services",
        items: [{ id: uid(), name: "", priceLabel: null, wasPriceLabel: null, description: null }],
      };
    case "photos":
      return { ...base, type: "photos", columns: 1, images: [{ id: uid(), url: "", alt: "", caption: null }] };
    case "text":
    default:
      return { ...base, type: "text", body: { type: "doc", content: [{ type: "paragraph" }] } };
  }
}

export function emptyDoc(): EducatorProfileDoc {
  return { version: EDUCATOR_PROFILE_DOC_VERSION, sections: [] };
}
