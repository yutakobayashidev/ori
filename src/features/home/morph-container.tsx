/* oxlint-disable shadcn/no-inline-styles -- MotionValues animate transforms/opacity; radius is needed by Motion layout correction. */
"use client";

import { motion, type MotionValue, useReducedMotion, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { spring, tween } from "./composer-motion";

/**
 * The shell. Never unmounted, so its size and radius animate between states.
 * Readiness (0..1 spring) lifts it and fades in a float shadow — both on
 * transform/opacity only; the shadow lives on its own layer.
 */
export function MorphContainer({
  readiness,
  children,
}: {
  readiness: MotionValue<number>;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const lift = useTransform(readiness, [0, 1], [0, reduce ? 0 : -2]);
  const floatOpacity = useTransform(readiness, [0, 1], [0, 1]);

  return (
    <motion.div style={{ y: lift }} className="relative">
      <motion.div
        layout
        layoutId="home-task-shell"
        transition={reduce ? tween.fade : spring.morph}
        style={{ borderRadius: 12 }}
        className="group/shell relative overflow-hidden border border-border bg-background composer-shadow-rest outline-0 outline-ring/10 transition-colors duration-150 ease-out focus-within:border-ring focus-within:outline-4"
      >
        <motion.div
          aria-hidden
          style={{ opacity: floatOpacity, borderRadius: 12 }}
          className="pointer-events-none absolute inset-0 composer-shadow-float"
        />
        {children}
      </motion.div>
    </motion.div>
  );
}
