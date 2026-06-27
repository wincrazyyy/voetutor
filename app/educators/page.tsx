import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";

import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { EducatorCard } from "@/components/educators/educator-card";
import { listPublishedEducators } from "@/lib/queries/educators-directory";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Browse educators | VOETutor",
  description:
    "The Vault of Excellence — browse every vetted IB educator on VOETutor. Filter by subject and find your tutor.",
};

const SUBJECTS = ["Maths", "Physics", "Chemistry", "Biology", "Economics", "English"] as const;

function matches(text: string | null | undefined, q: string): boolean {
  return Boolean(text && text.toLowerCase().includes(q));
}

export default async function EducatorsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; subject?: string }>;
}) {
  const { q, subject } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const subjectFilter = (subject ?? "").trim().toLowerCase();

  const all = await listPublishedEducators({ limit: 60 });

  const educators = all.filter((e) => {
    const tags = (e.subject_tags ?? []).join(" ").toLowerCase();
    const name = [e.first_name, e.last_name, e.display_name].filter(Boolean).join(" ").toLowerCase();
    const subjectOK = !subjectFilter || tags.includes(subjectFilter);
    const queryOK =
      !query ||
      name.includes(query) ||
      tags.includes(query) ||
      matches(e.role_label, query) ||
      matches(e.headline, query);
    return subjectOK && queryOK;
  });

  return (
    <main className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      <Navbar />

      <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 md:py-16">
        <header className="mb-8 space-y-3 border-b border-border pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            The Vault · Vetted IB Educators
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Find your IB educator
          </h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            Every educator here is approved by our team. Browse profiles, see what they teach, and open a
            profile to view their classes.
          </p>
        </header>

        <div className="mb-8 flex flex-col gap-4">
          <form action="/educators" method="get" className="relative max-w-xl">
            {subjectFilter ? <input type="hidden" name="subject" value={subject} /> : null}
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search educators, subjects…"
              className="h-12 w-full rounded-full border border-input bg-background pl-11 pr-4 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <SubjectPill label="All" href="/educators" active={!subjectFilter} />
            {SUBJECTS.map((s) => (
              <SubjectPill
                key={s}
                label={s}
                href={`/educators?subject=${encodeURIComponent(s)}`}
                active={subjectFilter === s.toLowerCase()}
              />
            ))}
          </div>
        </div>

        {educators.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-dashed border-border bg-card/50 px-6 py-16 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="mb-1 font-serif text-xl font-semibold text-foreground">No educators found</h2>
            <p className="text-sm text-muted-foreground">
              {query || subjectFilter
                ? "Try a different search or subject."
                : "More educators are joining the vault soon."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {educators.map((e) => (
              <EducatorCard key={e.educator_id} educator={e} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}

function SubjectPill({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
