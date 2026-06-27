import type { ReactNode } from "react";
import type { EducatorProfileDoc, ProfileSection } from "@/lib/types/profile-doc";
import { cn } from "@/lib/utils";
import { capabilitiesFor, type EducatorTier } from "@/lib/tiers/capabilities";
import { SectionTitle, ACCENT_TEXT } from "./section-title";
import { TextBody } from "./text-body";
import { ResultsBlock } from "./results";
import { ListsBlock } from "./lists";
import { PhotosBlock, photosHaveRenderable } from "./photos";
import { LinksBlock } from "./links";
import { ServicesBlock } from "./services";

/**
 * Public profile body renderer (server component). Allowlist + tier-gate: only section types the
 * educator's tier permits are rendered. Sections read as a typeset article — a running folio in the
 * left gutter, hairline rules as the only separators, prose flowing borderless while structured
 * content clusters into flat data plates. No bg-card boxes.
 */
export function ProfileDoc({
  doc,
  educatorId,
  tier,
}: {
  doc: EducatorProfileDoc;
  educatorId: string;
  tier: EducatorTier;
}) {
  if (!doc || doc.version !== 1 || !Array.isArray(doc.sections)) return null;
  const allowed = new Set(capabilitiesFor(tier).sectionTypes);
  const visible = doc.sections.filter((s) => allowed.has(s.type));
  if (!visible.length) return null;
  return (
    <div className="flex flex-col">
      {visible.map((s, i) => (
        <Section key={s.id} section={s} index={i} educatorId={educatorId} />
      ))}
    </div>
  );
}

function Section({
  section,
  index,
  educatorId,
}: {
  section: ProfileSection;
  index: number;
  educatorId: string;
}) {
  if (section.type === "photos" && !photosHaveRenderable(section.images, educatorId)) return null;
  const body = renderBody(section, educatorId);
  if (body === null) return null;

  const folio = String(index + 1).padStart(2, "0");
  const accent = section.accent ?? "none";
  const isProse = section.type === "text";

  return (
    <section
      className={cn(
        "py-10 sm:py-12 lg:grid lg:grid-cols-[3rem_1fr] lg:gap-6",
        index === 0 ? "pt-10" : "border-t border-border",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "hidden text-xs font-semibold uppercase tabular-nums tracking-[0.14em] lg:block",
          ACCENT_TEXT[accent],
        )}
      >
        {folio}
      </div>
      <div className={cn("min-w-0", isProse && "max-w-[65ch]")}>
        {section.title ? (
          <>
            <SectionTitle title={section.title} accent={accent} folio={folio} />
            <div className="mt-5">{body}</div>
          </>
        ) : (
          body
        )}
      </div>
    </section>
  );
}

function renderBody(s: ProfileSection, educatorId: string): ReactNode {
  switch (s.type) {
    case "text":
      return <TextBody doc={s.body} />;
    case "results":
      return <ResultsBlock cards={s.cards} />;
    case "lists":
      return <ListsBlock lists={s.lists} />;
    case "photos":
      return <PhotosBlock images={s.images} educatorId={educatorId} />;
    case "links":
      return <LinksBlock links={s.links} />;
    case "services":
      return <ServicesBlock items={s.items} />;
    default:
      return null;
  }
}
