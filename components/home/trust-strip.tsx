import { BadgeCheck, Lock, PlayCircle, TrendingUp } from "lucide-react";

const POINTS = [
  { icon: BadgeCheck, label: "Vetted IB educators" },
  { icon: PlayCircle, label: "HD on-demand video" },
  { icon: Lock, label: "Signed-URL secure access" },
  { icon: TrendingUp, label: "Progress tracked per lesson" },
] as const;

export function TrustStrip() {
  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-5 sm:justify-between">
        {POINTS.map(({ icon: Icon, label }) => (
          <div key={label} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="h-4 w-4 text-primary" />
            <span className="font-medium">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
