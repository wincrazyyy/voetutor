"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

/** Deterministic UTC string for SSR + first client render (avoids a hydration mismatch); localized post-mount. */
function utcFallback(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Renders an event's date/time in the viewer's local timezone (the event was stored as a TIMESTAMPTZ). */
export function EventDate({ at }: { at: string }) {
  const [display, setDisplay] = useState(() => utcFallback(at));

  useEffect(() => {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return;
    setDisplay(
      d.toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    );
  }, [at]);

  if (!display) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
      <CalendarClock className="w-3.5 h-3.5" />
      {display}
    </span>
  );
}
