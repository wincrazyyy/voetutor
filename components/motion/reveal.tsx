"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

/** True when ambient motion is OK (user has NOT requested reduced motion). */
export function useMotionOK(): boolean {
  return !useReducedMotion();
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * Scroll-reveal wrapper for downstream homepage sections: a once-only fade + rise as it enters view.
 * Under prefers-reduced-motion it renders a plain element with no animation (content is never gated
 * behind motion). Animates transform/opacity only.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "section" | "li";
}) {
  const ok = useMotionOK();
  const MotionTag = motion[as];

  if (!ok) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  /* Transform-only (opacity stays 1) so content is ALWAYS painted — SSR/no-JS users see it even if the
     IntersectionObserver never fires, matching the hero's LCP-safe entrance. */
  return (
    <MotionTag
      className={className}
      initial={{ y }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: "-15%" }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay }}
    >
      {children}
    </MotionTag>
  );
}

/** Stagger container — children using `revealItemVariants` cascade in. Reduced-motion → plain div. */
export function RevealStagger({
  children,
  className,
  stagger = 0.08,
  delayChildren = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
}) {
  const ok = useMotionOK();
  if (!ok) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-15%" }}
      variants={{ show: { transition: { staggerChildren: stagger, delayChildren } } }}
    >
      {children}
    </motion.div>
  );
}

/* Transform-only (opacity stays 1) so staggered children are painted on SSR / without JS. */
export const revealItemVariants: Variants = {
  hidden: { y: 22 },
  show: { y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
};

/** A single staggered child for use inside <RevealStagger>. */
export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li";
}) {
  const ok = useMotionOK();
  const MotionTag = motion[as];
  if (!ok) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  return (
    <MotionTag className={className} variants={revealItemVariants}>
      {children}
    </MotionTag>
  );
}
