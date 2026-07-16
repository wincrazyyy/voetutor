"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { VaultMark } from "@/components/brand/vault-mark";
import { EducatorCard } from "@/components/educators/educator-card";
import type { PublicEducatorCard } from "@/lib/types/database";

const SUBJECTS = ["Maths", "Physics", "Chemistry", "Economics"] as const;

/* Transform-only entrance (opacity stays 1) so content is always painted — LCP-safe and resilient if
   JS never runs (elements simply rest a few px off). The vault doors carry the dramatic reveal. */
const spineContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};
const spineItem = {
  hidden: { y: 16 },
  show: { y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

export function Hero({ featured }: { featured: PublicEducatorCard[] }) {
  const reduced = useReducedMotion();
  const animate = !reduced;

  return (
    <section className="relative flex min-h-svh flex-col overflow-hidden">
      {/* depth backdrop */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 voe-grid opacity-[0.5]" />
        <div className="absolute left-1/2 top-[36%] h-[44rem] w-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-[8%] top-[12%] h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
        <div className="absolute bottom-[8%] right-[10%] h-80 w-80 rounded-full bg-gold/10 blur-3xl" />
        <VaultMark className="absolute right-[6%] top-1/2 hidden h-[34rem] w-[34rem] -translate-y-1/2 text-primary opacity-[0.04] lg:block" />
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-10 px-5 py-16 lg:grid-cols-12 lg:gap-8 lg:py-20">
        {/* LEFT — verbal vault */}
        <motion.div
          className="lg:col-span-5"
          variants={animate ? spineContainer : undefined}
          initial={animate ? "hidden" : undefined}
          animate={animate ? "show" : undefined}
        >
          <motion.p
            variants={animate ? spineItem : undefined}
            className="mb-5 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
            <span className="sm:hidden">Vetted IB Educators</span>
            <span className="hidden sm:inline">The Vault · Vetted IB Educators</span>
          </motion.p>

          <motion.h1
            variants={animate ? spineItem : undefined}
            className="font-serif text-[clamp(2.6rem,5.2vw,4.6rem)] font-semibold leading-[0.95] tracking-tight text-foreground"
          >
            Find your
            <br />
            IB educator.
            <br />
            <span className="italic text-primary">Open the vault.</span>
          </motion.h1>

          <motion.p
            variants={animate ? spineItem : undefined}
            className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground"
          >
            A curated marketplace of vetted IB specialists. Browse real educators, watch HD lessons, and
            learn on demand.
          </motion.p>

          <motion.div variants={animate ? spineItem : undefined} className="mt-7">
            <Link
              href="/educators"
              className="group flex h-14 w-full max-w-md items-center gap-3 rounded-full border border-input bg-card/80 pl-5 pr-2 text-sm shadow-sm ring-offset-background backdrop-blur transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-muted-foreground">Search IB educators, subjects…</span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <span className="hidden sm:inline">Find your educator</span>
                <span className="sm:hidden">Browse</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </motion.div>

          <motion.div variants={animate ? spineItem : undefined} className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Popular:</span>
            {SUBJECTS.map((s) => (
              <Link
                key={s}
                href={`/educators?subject=${encodeURIComponent(s)}`}
                className="inline-flex min-h-10 items-center rounded-full border border-border px-4 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground sm:min-h-0 sm:px-3"
              >
                {s}
              </Link>
            ))}
          </motion.div>
        </motion.div>

        {/* RIGHT — marketplace stage */}
        <div className="lg:col-span-7">
          <RackStage featured={featured} animate={animate} />
        </div>
      </div>
    </section>
  );
}

function RackStage({ featured, animate }: { featured: PublicEducatorCard[]; animate: boolean }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (featured.length === 0) {
    return (
      <div className="flex min-h-[20rem] items-center justify-center rounded-[var(--radius)] border border-dashed border-border bg-card/40 p-8 text-center">
        <p className="max-w-xs text-sm text-muted-foreground">
          More educators are joining the vault soon. Check back shortly.
        </p>
      </div>
    );
  }

  const cards = featured.slice(0, 5);

  return (
    <>
      {/* Desktop: a clean grid of in-place 3D-tilt cards. No whole-plane rotation — that made the left
          card project forward and occlude the right card's hit area (dead zones / moving target). Each
          card now tilts around its OWN centre on hover, so neighbours never overlap. */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-2 items-stretch gap-5">
          {cards.map((e, i) => (
            <motion.div
              key={e.educator_id}
              className={cn(i === 4 && "col-span-2 mx-auto w-[calc(50%-0.625rem)]")}
              initial={animate ? { y: 28, scale: 0.96 } : false}
              animate={animate ? { y: 0, scale: 1 } : undefined}
              transition={{
                type: "spring",
                stiffness: 140,
                damping: 18,
                mass: 0.9,
                delay: animate ? 0.45 + i * 0.08 : 0,
              }}
            >
              <EducatorCard
                educator={e}
                interactive
                dimmed={animate && activeId !== null && activeId !== e.educator_id}
                onActiveChange={(on) =>
                  setActiveId(on ? e.educator_id : (cur) => (cur === e.educator_id ? null : cur))
                }
              />
            </motion.div>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <SeeAllPill />
        </div>
      </div>

      {/* Mobile / tablet: a horizontal snap rail of the same cards (no 3D, never hijacks scroll) */}
      <div className="lg:hidden">
        <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {cards.map((e) => (
            <div key={e.educator_id} className="w-[78%] shrink-0 snap-start sm:w-[55%]">
              <EducatorCard educator={e} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-center">
          <SeeAllPill />
        </div>
      </div>
    </>
  );
}

function SeeAllPill() {
  return (
    <Link
      href="/educators"
      className="group inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-primary/40 sm:min-h-0"
    >
      See all educators
      <ArrowRight className="h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
