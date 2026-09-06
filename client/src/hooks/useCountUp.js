import { useEffect, useRef, useState } from "react";

/**
 * Counts from 0 up to `value` ONCE — the first time `value` becomes a finite
 * number (i.e. when the dashboard data first arrives). Requirements from the
 * Part 2 spec:
 *   - short & subtle (≈650ms, easeOut)
 *   - no re-animation on ordinary rerenders: any later change to `value`
 *     snaps immediately
 *   - respects prefers-reduced-motion: the final number is shown at once
 *
 * No animation library — one requestAnimationFrame loop.
 */
function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function useCountUp(value, { duration = 650 } = {}) {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const [display, setDisplay] = useState(isNumber ? 0 : 0);
  const introDoneRef = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!isNumber) return undefined;

    // Already ran the intro once — reflect later values without animating.
    if (introDoneRef.current) {
      setDisplay(value);
      return undefined;
    }
    introDoneRef.current = true;

    if (prefersReducedMotion() || value === 0) {
      setDisplay(value);
      return undefined;
    }

    const target = value;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setDisplay(Math.round(target * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isNumber, value, duration]);

  return display;
}
