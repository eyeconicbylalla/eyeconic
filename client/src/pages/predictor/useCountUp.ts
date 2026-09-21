import { useEffect, useRef, useState } from 'react';

/**
 * Animated number reveal for the hero ranges. Starts at 0 and ends at the
 * exact displayed value (no invented precision). Does nothing at all under
 * prefers-reduced-motion — the initial state is already the final value.
 */
export function useCountUp(target: number | null, durationMs = 800): number {
  const [value, setValue] = useState<number>(() => {
    if (target === null || !Number.isFinite(target)) return target ?? 0;
    if (prefersReducedMotion() || durationMs <= 0) return target;
    return 0;
  });

  useEffect(() => {
    if (target === null || !Number.isFinite(target)) {
      setValue(target ?? 0);
      return;
    }
    if (prefersReducedMotion() || durationMs <= 0) {
      setValue(target);
      return;
    }
    let raf = 0;
    let settled = false;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setValue(target * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        settled = true;
        setValue(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (!settled) cancelAnimationFrame(raf);
    };
  }, [target, durationMs]);

  return value;
}

/** True when the user asked for reduced motion (static render paths). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Small helper for focus management on view swaps (P4). */
export function useFocusOnMount<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (enabled && ref.current) {
      ref.current.focus({ preventScroll: true });
    }
  }, [enabled]);
  return ref;
}
