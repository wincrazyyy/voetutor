import Link from "next/link";
import { GraduationCap, Sparkles, Users, ShieldCheck, BookOpen } from "lucide-react";

interface AuthHeroPanelProps {
  variant: "sign-up" | "login";
}

export function AuthHeroPanel({ variant }: AuthHeroPanelProps) {
  const heading =
    variant === "sign-up" ? "Join WSPortal." : "Welcome back.";
  const subheading =
    variant === "sign-up"
      ? "Premium video tutoring, structured curriculum, and expert educators in one calm workspace."
      : "Pick up exactly where you left off. Your dashboard, classes, and Q&A are one click away.";

  const bullets = [
    {
      icon: BookOpen,
      title: "Structured curriculum",
      body: "Topics and subtopics that mirror the syllabus, with progress tracked per video.",
    },
    {
      icon: Users,
      title: "Live forums",
      body: "Ask your educator, swap notes with peers, get answers tied to the exact lesson.",
    },
    {
      icon: ShieldCheck,
      title: "Vetted educators",
      body: "Every educator is approved by our team before they appear on the platform.",
    },
  ];

  return (
    <aside className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary/95 via-primary to-primary/80 text-primary-foreground p-12 overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-12rem] left-[-6rem] w-[28rem] h-[28rem] rounded-full bg-white/40 blur-3xl" />
        <div className="absolute bottom-[-8rem] right-[-8rem] w-[24rem] h-[24rem] rounded-full bg-white/30 blur-3xl" />
      </div>

      <div className="relative">
        <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <GraduationCap className="w-7 h-7" />
          <span className="font-bold text-xl tracking-tight">WSPortal</span>
        </Link>
      </div>

      <div className="relative space-y-6 max-w-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          {variant === "sign-up" ? "Free to join" : "Glad to see you"}
        </div>
        <h1 className="text-4xl font-black leading-tight tracking-tight">{heading}</h1>
        <p className="text-base text-primary-foreground/85 leading-relaxed">{subheading}</p>

        <ul className="space-y-4 pt-4">
          {bullets.map((b) => {
            const Icon = b.icon;
            return (
              <li key={b.title} className="flex items-start gap-3">
                <div className="mt-0.5 w-9 h-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{b.title}</div>
                  <div className="text-xs text-primary-foreground/75 leading-relaxed">{b.body}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative text-xs text-primary-foreground/70">
        © {new Date().getFullYear()} WSPortal. Crafted for IB students and educators.
      </div>
    </aside>
  );
}
