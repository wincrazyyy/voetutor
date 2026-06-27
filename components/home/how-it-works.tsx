import { Compass, IdCard, GraduationCap } from "lucide-react";
import { Reveal, RevealStagger, RevealItem } from "@/components/motion/reveal";

const STEPS = [
  {
    icon: Compass,
    title: "Browse the vault",
    body: "Search vetted IB educators by subject. Every profile is reviewed before it goes live.",
  },
  {
    icon: IdCard,
    title: "View their profile",
    body: "See an educator’s background, results, and the classes they teach — then pick your fit.",
  },
  {
    icon: GraduationCap,
    title: "Enrol & learn",
    body: "Join a class and learn on demand with HD video lessons and progress tracked per lesson.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-20 md:py-24">
      <Reveal className="mb-12 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">How it works</p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          From the vault to your first lesson
        </h2>
      </Reveal>

      <RevealStagger className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <RevealItem
            key={title}
            className="group rounded-[var(--radius)] border border-border bg-card p-6 transition-transform duration-200 hover:-translate-y-1 hover:border-primary/30"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <span className="font-serif text-2xl font-semibold text-border transition-colors group-hover:text-primary/30">
                0{i + 1}
              </span>
            </div>
            <h3 className="mb-1.5 font-serif text-xl font-semibold text-foreground">{title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </RevealItem>
        ))}
      </RevealStagger>
    </section>
  );
}
