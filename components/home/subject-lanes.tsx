import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";

const SUBJECTS = [
  "Maths",
  "Physics",
  "Chemistry",
  "Biology",
  "Economics",
  "English",
  "Computer Science",
  "Business",
] as const;

export function SubjectLanes() {
  return (
    <section className="border-y border-border bg-card/30">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-20">
        <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Browse by subject</p>
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Find a specialist for your subject
            </h2>
          </div>
          <Link
            href="/educators"
            className="group relative inline-flex items-center gap-1.5 text-sm font-medium text-primary after:absolute after:-inset-3 after:content-['']"
          >
            All educators
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>

        <Reveal className="flex flex-wrap gap-3">
          {SUBJECTS.map((s) => (
            <Link
              key={s}
              href={`/educators?subject=${encodeURIComponent(s)}`}
              className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
            >
              {s}
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
