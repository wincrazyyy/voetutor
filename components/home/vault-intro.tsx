"use client";

import { useEffect, useState } from "react";

/* "The Vault Opens" — the one-time homepage intro. The overlay markup is SSR-rendered (so the very first
   painted frame is the sealed vault, not a flash of the hero) and the open is pure CSS (see globals.css
   .voe-vault*), so it reveals the hero even without JS. A client effect runs it ONCE per session: the
   first visit plays the animation then unmounts; a repeat visit (sessionStorage flag) unmounts it
   immediately. prefers-reduced-motion is handled in CSS (the overlay is display:none, no flash). The
   overlay is pointer-events:none so it never blocks the hero. */

function VaultDial() {
  const ticks = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="voe-steel" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="hsl(171 28% 34%)" />
          <stop offset="70%" stopColor="hsl(171 42% 20%)" />
          <stop offset="100%" stopColor="hsl(171 48% 14%)" />
        </radialGradient>
        <radialGradient id="voe-hub" cx="40%" cy="34%" r="75%">
          <stop offset="0%" stopColor="hsl(171 26% 26%)" />
          <stop offset="100%" stopColor="hsl(171 46% 12%)" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="47" fill="url(#voe-steel)" stroke="hsl(var(--accent-gold))" strokeWidth="1.4" />
      <circle cx="50" cy="50" r="43" fill="none" stroke="hsl(var(--accent-gold) / 0.35)" strokeWidth="0.75" />

      {ticks.map((i) => (
        <line
          key={i}
          x1="50"
          y1="7.5"
          x2="50"
          y2={i % 3 === 0 ? "13.5" : "11"}
          stroke="hsl(var(--accent-gold) / 0.85)"
          strokeWidth={i % 3 === 0 ? "1.5" : "1"}
          strokeLinecap="round"
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}

      <g stroke="hsl(var(--accent-gold))" strokeWidth="3.4" strokeLinecap="round">
        {[0, 120, 240].map((deg) => (
          <line key={deg} x1="50" y1="50" x2="50" y2="21" transform={`rotate(${deg} 50 50)`} />
        ))}
      </g>

      <circle cx="50" cy="50" r="16" fill="url(#voe-hub)" stroke="hsl(var(--accent-gold))" strokeWidth="1.4" />

      {/* the keyhole crest at the hub — same geometry as the navbar mark */}
      <g transform="translate(50 50) scale(1.85) translate(-16 -13.4)" fill="hsl(var(--accent-gold))">
        <circle cx="16" cy="9.4" r="2.3" />
        <path d="M13.4 13.3 L11.2 19.4 L13.9 19.4 L16 16.4 L18.1 19.4 L20.8 19.4 L18.6 13.3 Z" />
      </g>
    </svg>
  );
}

export function VaultIntro() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = Boolean(sessionStorage.getItem("voe_vault_opened"));
      sessionStorage.setItem("voe_vault_opened", "1");
    } catch {
      /* sessionStorage unavailable — fall through and just play the CSS intro */
    }
    if (seen) {
      setDone(true);
      return;
    }
    const t = window.setTimeout(() => setDone(true), 1750);
    return () => window.clearTimeout(t);
  }, []);

  if (done) return null;

  return (
    <div className="voe-vault" aria-hidden>
      <div className="voe-door voe-door--l" />
      <div className="voe-door voe-door--r" />
      <div className="voe-seam">
        <div className="voe-seam-sweep" />
      </div>
      <div className="voe-dial">
        <div className="voe-dial-spin">
          <VaultDial />
        </div>
      </div>
    </div>
  );
}
