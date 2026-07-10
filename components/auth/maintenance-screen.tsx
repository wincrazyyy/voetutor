"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";

/* Fixed maintenance palette — deliberately theme-independent (always dark premium), matching the
   original maintenance screen. Hex is intentional here (not Tailwind tokens) for that reason. */
const C = {
  bg: "radial-gradient(1200px 600px at 50% -10%, #0c2b27 0%, #061715 55%, #04100e 100%)",
  text: "#e8f4f1",
  muted: "#a9ccc4",
  faint: "#9ec9c0",
  heading: "#f3faf8",
  gold: "#e0b341",
  teal: "#16a394",
  link: "#7fb8ad",
  panelBg: "rgba(11,33,30,0.72)",
  panelBorder: "rgba(255,255,255,0.10)",
  inputBg: "rgba(255,255,255,0.05)",
  inputBorder: "rgba(255,255,255,0.16)",
};
const SERIF = "ui-serif, Georgia, 'Times New Roman', serif";

export function MaintenanceScreen() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const reduce = useReducedMotion();

  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 26 };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const userId = data.user?.id;
      if (!userId) {
        setError("Could not sign in.");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if ((profile as { role?: string } | null)?.role !== "admin") {
        await supabase.auth.signOut();
        setError("This sign-in is for administrators only.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ background: C.bg, color: C.text }}
      className="flex min-h-screen items-center justify-center px-6 py-12"
    >
      <div className="flex w-full max-w-md flex-col items-center text-center">
        {/* Maintenance copy — slides up when the panel opens */}
        <motion.div
          animate={{ y: open && !reduce ? -12 : 0 }}
          transition={spring}
          className="flex flex-col items-center"
        >
          <div style={{ color: C.faint, letterSpacing: "0.28em" }} className="text-[13px] font-medium uppercase">
            Vault <span style={{ color: C.gold }} className="font-semibold">of</span> Excellence
          </div>
          <h1
            style={{ color: C.heading, fontFamily: SERIF }}
            className="mt-7 text-3xl font-semibold leading-tight sm:text-4xl"
          >
            We&rsquo;ll be right back
          </h1>
          <p style={{ color: C.muted }} className="mt-3.5 max-w-[42ch] text-base leading-relaxed">
            VOETutor is undergoing brief scheduled maintenance. Thanks for your patience &mdash; please
            check back shortly.
          </p>
          <div style={{ background: C.teal }} className="mt-7 h-0.5 w-12 rounded-full" />

          <AnimatePresence initial={false}>
            {!open && (
              <motion.button
                key="trigger"
                type="button"
                onClick={() => setOpen(true)}
                initial={false}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.15 }}
                style={{ color: C.link }}
                className="mt-9 text-sm underline-offset-4 hover:underline"
              >
                Administrator sign-in
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Admin sign-in panel — springs in */}
        <AnimatePresence>
          {open && (
            <motion.div
              key="panel"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
              transition={spring}
              style={{ background: C.panelBg, borderColor: C.panelBorder }}
              className="mt-9 w-full rounded-2xl border p-6 text-left backdrop-blur-sm"
            >
              <span style={{ color: C.faint, letterSpacing: "0.18em" }} className="text-[11px] font-semibold uppercase">
                Maintenance mode
              </span>
              <h2 style={{ color: C.heading, fontFamily: SERIF }} className="mt-1.5 text-xl font-semibold">
                Administrator sign-in
              </h2>
              <p style={{ color: C.muted }} className="mt-1.5 text-sm leading-relaxed">
                The site is temporarily down for maintenance. Sign in with an administrator account to
                review it.
              </p>

              <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="m-email" style={{ color: C.faint }} className="text-xs font-medium">
                    Email
                  </label>
                  <input
                    id="m-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    placeholder="admin@voetutor.com"
                    style={{ background: C.inputBg, borderColor: C.inputBorder, color: C.text }}
                    className="w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-[#6f938b] focus:border-[#2dd4bf] disabled:opacity-60"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="m-password" style={{ color: C.faint }} className="text-xs font-medium">
                    Password
                  </label>
                  <input
                    id="m-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    style={{ background: C.inputBg, borderColor: C.inputBorder, color: C.text }}
                    className="w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[#2dd4bf] disabled:opacity-60"
                  />
                </div>

                {error && (
                  <p
                    style={{ color: "#fca5a5", background: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.25)" }}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ background: C.teal, color: "#04130f" }}
                  className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {loading && <Spinner className="h-4 w-4" />}
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                style={{ color: C.faint }}
                className="mt-4 w-full text-center text-xs hover:underline"
              >
                Back
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
