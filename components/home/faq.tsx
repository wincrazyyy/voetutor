import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/motion/reveal";

const FAQS = [
  {
    q: "What is VOETutor?",
    a: "VOETutor — the Vault of Excellence — is a curated marketplace of vetted IB educators. Browse specialist tutors, open their profiles, and enrol in their classes to learn through HD video lessons.",
  },
  {
    q: "How are educators vetted?",
    a: "Every educator applies and is reviewed by our team before their profile goes live. Approved educators can publish a public profile and classes; you’ll see a verified badge on educators we’ve confirmed.",
  },
  {
    q: "How do I get started with an educator?",
    a: "Browse the educators directory, open a profile to see their background and the classes they teach, then enrol. Free classes you can join straight away.",
  },
  {
    q: "Is it free?",
    a: "Creating an account and browsing educators is free, and free classes can be joined directly. Paid classes and checkout are coming soon — until then, free enrolment works end to end.",
  },
  {
    q: "Which subjects and curricula are covered?",
    a: "VOETutor focuses on the IB Diploma Programme across subjects like Maths, the sciences, Economics, and English, with more educators joining the vault over time.",
  },
] as const;

export function FAQ() {
  return (
    <section className="flex w-full flex-col items-center bg-background py-20 md:py-24">
      <div className="mx-auto w-full max-w-3xl px-5">
        <Reveal className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">FAQ</p>
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Questions, answered
          </h2>
        </Reveal>

        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((item, i) => (
            <AccordionItem key={item.q} value={`item-${i}`} className="border-b border-border/60 py-2">
              <AccordionTrigger className="text-left font-serif text-lg font-semibold transition-colors hover:text-primary">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
