import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { VaultMark } from "@/components/brand/vault-mark";

export function BecomeEducator() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-20 md:py-24">
      <Reveal className="relative overflow-hidden rounded-[calc(var(--radius)+6px)] border border-primary/20 bg-primary/[0.06] px-6 py-12 text-center sm:px-12">
        <VaultMark
          className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 text-primary opacity-[0.06]"
        />
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Teach on VOETutor</p>
        <h2 className="mx-auto max-w-2xl font-serif text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Are you an IB educator? Earn a place in the vault.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Apply to teach, get reviewed by our team, and publish your own profile and classes to students
          across the IB.
        </p>
        <div className="mt-7">
          <Link
            href="/auth/sign-up"
            className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
          >
            Apply as an educator
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
