"use client";

import { useRef, useState } from "react";
import { Plus, Trash2, Upload, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { uid } from "@/lib/profile/builder";
import { PROFILE_LIMITS } from "@/lib/profile/limits";
import type {
  ProfileSection,
  TextSection,
  ResultsSection,
  ListsSection,
  PhotosSection,
  LinksSection,
  ServicesSection,
  ImageItem,
} from "@/lib/types/profile-doc";

import { RichTextEditor } from "./rich-text-editor";
import { uploadEducatorImage } from "./upload-image";

const TEXTAREA_CLASS = cn(
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed shadow-xs",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
);

const HTTPS = /^https:\/\//i;

function httpsInvalid(url: string): boolean {
  const v = url.trim();
  if (!v || HTTPS.test(v)) return false;
  return !"https://".startsWith(v.toLowerCase());
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground/70">{hint}</span> : null}
    </label>
  );
}

function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Remove"
      title="Remove"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground ring-offset-background transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function AddButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="w-full border-dashed"
    >
      <Plus className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}

function ItemCard({
  label,
  index,
  empty,
  onRemove,
  removeDisabled,
  children,
}: {
  label: string;
  index: number;
  empty: boolean;
  onRemove: () => void;
  removeDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-md border p-3",
        empty ? "border-dashed border-border bg-muted/30" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label} {index}
        </span>
        <RemoveButton onClick={onRemove} disabled={removeDisabled} />
      </div>
      {children}
      {empty ? (
        <p className="text-xs italic text-muted-foreground/70">
          Empty — fill this in, or it&apos;s removed automatically when you save.
        </p>
      ) : null}
    </div>
  );
}

function TextEditor({ section, onChange }: { section: TextSection; onChange: (s: TextSection) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Your story. A strong few paragraphs do most of the work — this is the heart of your profile.
      </p>
      <RichTextEditor value={section.body} onChange={(body) => onChange({ ...section, body })} />
    </div>
  );
}

function ResultsEditor({ section, onChange }: { section: ResultsSection; onChange: (s: ResultsSection) => void }) {
  const setCards = (cards: ResultsSection["cards"]) => onChange({ ...section, cards });
  const remaining = PROFILE_LIMITS.results.maxCards - section.cards.length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Highlight grades or outcomes — they show as big coloured numbers, laid out automatically.
      </p>
      {section.cards.map((c, i) => {
        const empty = !c.title.trim() && !c.value.trim() && !(c.helper ?? "").trim();
        return (
          <ItemCard
            key={c.id}
            label="Result"
            index={i + 1}
            empty={empty}
            removeDisabled={section.cards.length <= 1}
            onRemove={() => setCards(section.cards.filter((x) => x.id !== c.id))}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem]">
              <Field label="Subject or exam">
                <Input
                  placeholder="IB Mathematics AA HL"
                  value={c.title}
                  onChange={(e) => setCards(section.cards.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)))}
                />
              </Field>
              <Field label="Result" hint="The big number — keep it short">
                <Input
                  placeholder="7"
                  value={c.value}
                  onChange={(e) => setCards(section.cards.map((x) => (x.id === c.id ? { ...x, value: e.target.value } : x)))}
                />
              </Field>
            </div>
            <Field label="Caption (optional)" hint="Small grey line under the result, e.g. May 2024 cohort">
              <Input
                placeholder="May 2024 cohort"
                value={c.helper ?? ""}
                onChange={(e) =>
                  setCards(section.cards.map((x) => (x.id === c.id ? { ...x, helper: e.target.value || null } : x)))
                }
              />
            </Field>
          </ItemCard>
        );
      })}
      <AddButton
        label={remaining > 0 ? `Add result — ${remaining} left` : "Result limit reached"}
        disabled={remaining <= 0}
        onClick={() => setCards([...section.cards, { id: uid(), kind: "result", title: "", value: "", helper: null }])}
      />
    </div>
  );
}

function ListsEditor({ section, onChange }: { section: ListsSection; onChange: (s: ListsSection) => void }) {
  const setLists = (lists: ListsSection["lists"]) => onChange({ ...section, lists });
  const remaining = PROFILE_LIMITS.lists.maxColumns - section.lists.length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Pill groups — courses you teach, schools, skills. Each group becomes a column automatically.
      </p>
      {section.lists.map((col, i) => {
        const count = col.items.filter((it) => it.trim()).length;
        const empty = !(col.title ?? "").trim() && count === 0 && !(col.countLabel ?? "").trim();
        const over = count > PROFILE_LIMITS.lists.maxPillsPerColumn;
        return (
          <ItemCard
            key={col.id}
            label="Column"
            index={i + 1}
            empty={empty}
            removeDisabled={section.lists.length <= 1}
            onRemove={() => setLists(section.lists.filter((x) => x.id !== col.id))}
          >
            <Field label="Group heading (optional)">
              <Input
                placeholder="Courses I teach"
                value={col.title ?? ""}
                onChange={(e) => setLists(section.lists.map((x) => (x.id === col.id ? { ...x, title: e.target.value || null } : x)))}
              />
            </Field>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Items — one per line</span>
                <span className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
                  {count ? `${count} item${count === 1 ? "" : "s"}` : "No items yet"}
                </span>
              </div>
              <textarea
                rows={5}
                placeholder={"Math AA HL\nMath AI SL\nFurther Maths"}
                value={col.items.join("\n")}
                onChange={(e) => setLists(section.lists.map((x) => (x.id === col.id ? { ...x, items: e.target.value.split("\n") } : x)))}
                className={TEXTAREA_CLASS}
              />
            </div>
            <Field label="Count word (optional)" hint="Shows as '12 courses' under the pills — leave blank to hide the count.">
              <Input
                placeholder="courses"
                value={col.countLabel ?? ""}
                onChange={(e) => setLists(section.lists.map((x) => (x.id === col.id ? { ...x, countLabel: e.target.value || null } : x)))}
              />
            </Field>
          </ItemCard>
        );
      })}
      <AddButton
        label={remaining > 0 ? `Add column — ${remaining} left` : "Column limit reached"}
        disabled={remaining <= 0}
        onClick={() => setLists([...section.lists, { id: uid(), kind: "list", title: null, items: [], countLabel: null }])}
      />
    </div>
  );
}

function LinksEditor({ section, onChange }: { section: LinksSection; onChange: (s: LinksSection) => void }) {
  const setLinks = (links: LinksSection["links"]) => onChange({ ...section, links });
  const remaining = PROFILE_LIMITS.links.maxLinks - section.links.length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Your site and socials — shown as a tidy list.</p>
      {section.links.map((l, i) => {
        const empty = !l.label.trim() && !l.url.trim();
        const invalid = httpsInvalid(l.url);
        return (
          <ItemCard
            key={l.id}
            label="Link"
            index={i + 1}
            empty={empty}
            removeDisabled={section.links.length <= 1}
            onRemove={() => setLinks(section.links.filter((x) => x.id !== l.id))}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr]">
              <Field label="Label">
                <Input
                  placeholder="Instagram"
                  value={l.label}
                  onChange={(e) => setLinks(section.links.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))}
                />
              </Field>
              <Field label="Web address" hint={invalid ? undefined : "Must start with https://"}>
                <Input
                  placeholder="https://instagram.com/you"
                  value={l.url}
                  aria-invalid={invalid}
                  onChange={(e) => setLinks(section.links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)))}
                />
                {invalid ? <span className="text-xs text-destructive">Add https:// to the front.</span> : null}
              </Field>
            </div>
          </ItemCard>
        );
      })}
      <AddButton
        label={remaining > 0 ? `Add link — ${remaining} left` : "Link limit reached"}
        disabled={remaining <= 0}
        onClick={() => setLinks([...section.links, { id: uid(), label: "", url: "" }])}
      />
    </div>
  );
}

function ServicesEditor({ section, onChange }: { section: ServicesSection; onChange: (s: ServicesSection) => void }) {
  const setItems = (items: ServicesSection["items"]) => onChange({ ...section, items });
  const remaining = PROFILE_LIMITS.services.maxItems - section.items.length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        What you offer. Prices are display-only for now — no checkout yet.
      </p>
      {section.items.map((s, i) => {
        const empty =
          !s.name.trim() && !(s.priceLabel ?? "").trim() && !(s.wasPriceLabel ?? "").trim() && !(s.description ?? "").trim();
        return (
          <ItemCard
            key={s.id}
            label="Service"
            index={i + 1}
            empty={empty}
            removeDisabled={section.items.length <= 1}
            onRemove={() => setItems(section.items.filter((x) => x.id !== s.id))}
          >
            <Field label="Service">
              <Input
                placeholder="1-on-1 lesson"
                value={s.name}
                onChange={(e) => setItems(section.items.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
              />
            </Field>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Price">
                <Input
                  placeholder="HK$800/hr"
                  value={s.priceLabel ?? ""}
                  onChange={(e) => setItems(section.items.map((x) => (x.id === s.id ? { ...x, priceLabel: e.target.value || null } : x)))}
                />
              </Field>
              <Field label="Original price (optional)" hint="Shown struck-through to flag a discount.">
                <Input
                  placeholder="HK$1000"
                  value={s.wasPriceLabel ?? ""}
                  onChange={(e) => setItems(section.items.map((x) => (x.id === s.id ? { ...x, wasPriceLabel: e.target.value || null } : x)))}
                />
              </Field>
            </div>
            <Field label="Description (optional)">
              <textarea
                rows={2}
                placeholder="60-minute focused session, tailored to your syllabus."
                value={s.description ?? ""}
                onChange={(e) => setItems(section.items.map((x) => (x.id === s.id ? { ...x, description: e.target.value || null } : x)))}
                className={TEXTAREA_CLASS}
              />
            </Field>
          </ItemCard>
        );
      })}
      <AddButton
        label={remaining > 0 ? `Add service — ${remaining} left` : "Service limit reached"}
        disabled={remaining <= 0}
        onClick={() =>
          setItems([...section.items, { id: uid(), name: "", priceLabel: null, wasPriceLabel: null, description: null }])
        }
      />
    </div>
  );
}

function PhotoCard({
  image,
  index,
  educatorId,
  onChange,
  onRemove,
  removeDisabled,
}: {
  image: ImageItem;
  index: number;
  educatorId: string;
  onChange: (im: ImageItem) => void;
  onRemove: () => void;
  removeDisabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setBusy(true);
    const res = await uploadEducatorImage(file, educatorId, "photo");
    setBusy(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    if (res.url) onChange({ ...image, url: res.url });
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Photo {index}</span>
        <RemoveButton onClick={onRemove} disabled={removeDisabled} />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFile}
      />
      {image.url ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={image.alt || "Preview"}
            className="h-20 w-28 shrink-0 rounded-md border border-border object-cover"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Replace
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-muted/30 text-xs text-muted-foreground ring-offset-background transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {busy ? "Uploading…" : "Upload an image — PNG, JPG, or WEBP (max 5 MB)"}
        </button>
      )}
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      <Field label="Describe this photo (for accessibility)">
        <Input
          placeholder="e.g. Anthony teaching a class"
          value={image.alt}
          onChange={(e) => onChange({ ...image, alt: e.target.value })}
        />
      </Field>
      <Field label="Caption (optional)" hint="Shown in small text under the photo.">
        <Input
          placeholder="e.g. IB revision workshop, 2024"
          value={image.caption ?? ""}
          onChange={(e) => onChange({ ...image, caption: e.target.value || null })}
        />
      </Field>
    </div>
  );
}

function PhotosEditor({
  section,
  educatorId,
  onChange,
}: {
  section: PhotosSection;
  educatorId: string;
  onChange: (s: PhotosSection) => void;
}) {
  const setImages = (images: PhotosSection["images"]) => onChange({ ...section, images });
  const remaining = PROFILE_LIMITS.photos.maxImages - section.images.length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">A small gallery — images show in a neat grid, sized automatically.</p>
      {section.images.map((im, i) => (
        <PhotoCard
          key={im.id}
          image={im}
          index={i + 1}
          educatorId={educatorId}
          removeDisabled={section.images.length <= 1}
          onChange={(next) => setImages(section.images.map((x) => (x.id === im.id ? next : x)))}
          onRemove={() => setImages(section.images.filter((x) => x.id !== im.id))}
        />
      ))}
      <AddButton
        label={remaining > 0 ? `Add photo — ${remaining} left` : "Photo limit reached"}
        disabled={remaining <= 0}
        onClick={() => setImages([...section.images, { id: uid(), url: "", alt: "", caption: null }])}
      />
    </div>
  );
}

export function SectionBodyEditor({
  section,
  educatorId,
  onChange,
}: {
  section: ProfileSection;
  educatorId: string;
  onChange: (s: ProfileSection) => void;
}) {
  switch (section.type) {
    case "text":
      return <TextEditor section={section} onChange={onChange} />;
    case "results":
      return <ResultsEditor section={section} onChange={onChange} />;
    case "lists":
      return <ListsEditor section={section} onChange={onChange} />;
    case "photos":
      return <PhotosEditor section={section} educatorId={educatorId} onChange={onChange} />;
    case "links":
      return <LinksEditor section={section} onChange={onChange} />;
    case "services":
      return <ServicesEditor section={section} onChange={onChange} />;
    default:
      return null;
  }
}
