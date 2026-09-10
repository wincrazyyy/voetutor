"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, FileText, FolderTree, PlayCircle, Search, X } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CurriculumItem, TopicWithChildren } from "@/lib/queries/curriculum";
import { formatBytes, formatShortDuration } from "@/lib/utils/format";

interface CurriculumAccordionProps {
  curriculum: TopicWithChildren[];
  classId: string;
}

/**
 * One lesson or note row. Styled like the educator board's rows (icon · title · chip) but the title WRAPS
 * instead of truncating — this rail is narrow and long lesson titles must stay readable.
 */
function ItemRow({ item, classId }: { item: CurriculumItem; classId: string }) {
  const rowClass =
    "group flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors hover:bg-muted/50";
  const chipClass =
    "mt-px shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground sm:text-[10px]";

  if (item.kind === "video") {
    return (
      <Link href={`/lesson/${item.id}?from=${classId}`} className={rowClass}>
        {item.is_completed ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        ) : (
          <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 break-words text-sm font-medium leading-snug transition-colors group-hover:text-primary",
            item.is_completed ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {item.title}
        </span>
        <span className={chipClass}>{formatShortDuration(item.duration)}</span>
      </Link>
    );
  }

  return (
    <a href={`/api/resources/${item.id}/download`} target="_blank" rel="noopener noreferrer" className={rowClass}>
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-muted-foreground transition-colors group-hover:text-foreground">
        {item.title}
      </span>
      <span className={chipClass}>{formatBytes(item.size_bytes)}</span>
    </a>
  );
}

function SectionLabel({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "primary" }) {
  return (
    <div
      className={cn(
        "break-words border-b border-border/50 px-4 py-2.5 text-xs font-bold uppercase tracking-widest sm:text-[10px]",
        tone === "primary" ? "bg-primary/5 text-primary" : "bg-muted/20 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

interface SearchGroup {
  key: string;
  label: string;
  items: CurriculumItem[];
}

/** Case-insensitive match over item titles; a hit on a topic or subtopic title includes that node's items. */
function searchCurriculum(curriculum: TopicWithChildren[], query: string): SearchGroup[] {
  const q = query.trim().toLowerCase();
  const hit = (s: string) => s.toLowerCase().includes(q);
  const groups: SearchGroup[] = [];
  for (const topic of curriculum) {
    const topicHit = hit(topic.title);
    const topicItems = topic.items.filter((i) => topicHit || hit(i.title));
    if (topicItems.length > 0) groups.push({ key: topic.id, label: topic.title, items: topicItems });
    for (const sub of topic.subtopics) {
      const subHit = topicHit || hit(sub.title);
      const subItems = sub.items.filter((i) => subHit || hit(i.title));
      if (subItems.length > 0) {
        groups.push({ key: sub.id, label: `${topic.title} › ${sub.title}`, items: subItems });
      }
    }
  }
  return groups;
}

export function CurriculumAccordion({ curriculum, classId }: CurriculumAccordionProps) {
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const results = useMemo(() => (searching ? searchCurriculum(curriculum, query) : []), [curriculum, query, searching]);
  const resultCount = results.reduce((n, g) => n + g.items.length, 0);

  if (curriculum.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Curriculum</h2>
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No topics available yet. Your educator is preparing the curriculum.
        </div>
      </div>
    );
  }

  const activeTopic = curriculum.find((t) => t.status === "active");
  const defaultOpen = [activeTopic?.id ?? curriculum[0].id];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Curriculum</h2>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lessons and notes…"
          aria-label="Search lessons and notes"
          className="bg-card pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {searching ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
            {resultCount === 0
              ? "No lessons or notes match your search."
              : `${resultCount} ${resultCount === 1 ? "result" : "results"}`}
          </p>
          {resultCount > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {results.map((group) => (
                <div key={group.key}>
                  <SectionLabel>{group.label}</SectionLabel>
                  {group.items.map((item) => (
                    <ItemRow key={item.placement_id} item={item} classId={classId} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <Accordion type="multiple" defaultValue={defaultOpen} className="flex w-full flex-col gap-3">
          {curriculum.map((topic) => {
            const totalVideos = topic.total_videos;
            const hasTopicMaterials = topic.items.length > 0;

            return (
              <AccordionItem
                key={topic.id}
                value={topic.id}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
              >
                <AccordionTrigger className="bg-muted/10 p-4 text-left transition-colors hover:bg-muted/40 hover:no-underline sm:p-5 [&[data-state=open]]:bg-muted/40">
                  <div className="flex min-w-0 flex-col gap-2 pr-2">
                    <h3 className="min-w-0 break-words text-base font-bold leading-tight">{topic.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-medium text-muted-foreground">
                      {topic.total_duration && (
                        <span className="flex shrink-0 items-center gap-1">
                          <Clock className="h-3 w-3" /> {formatShortDuration(topic.total_duration)}
                        </span>
                      )}
                      <span className="flex shrink-0 items-center gap-1">
                        <FolderTree className="h-3 w-3" /> {topic.subtopics.length}
                      </span>
                      <span className={cn("shrink-0", topic.watched_videos === totalVideos && totalVideos > 0 && "text-primary")}>
                        {topic.watched_videos} / {totalVideos} {totalVideos === 1 ? "Video" : "Videos"}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="border-t border-border p-0">
                  <div className="flex flex-col">
                    {hasTopicMaterials && (
                      <div>
                        <SectionLabel tone="primary">Topic materials</SectionLabel>
                        {topic.items.map((item) => (
                          <ItemRow key={item.placement_id} item={item} classId={classId} />
                        ))}
                      </div>
                    )}

                    {topic.subtopics.map((subtopic) => (
                      <div key={subtopic.id}>
                        <SectionLabel>{subtopic.title}</SectionLabel>
                        {subtopic.items.length > 0 ? (
                          subtopic.items.map((item) => (
                            <ItemRow key={item.placement_id} item={item} classId={classId} />
                          ))
                        ) : (
                          <div className="border-b border-border/50 px-4 py-3 text-xs italic text-muted-foreground last:border-0">
                            No content yet.
                          </div>
                        )}
                      </div>
                    ))}

                    {topic.subtopics.length === 0 && !hasTopicMaterials && (
                      <div className="px-4 py-4 text-xs italic text-muted-foreground">No subtopics yet.</div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
