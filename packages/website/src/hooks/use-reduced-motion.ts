import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * `true` when the visitor has asked for less motion.
 *
 * The CSS half of the site's motion policy lives in `styles/tokens.css`, which
 * zeroes the duration tokens under the same query — that covers every
 * transition and keyframe, including ones nobody remembered to think about.
 * This hook exists for the half CSS cannot reach: a `requestAnimationFrame`
 * loop, a `setInterval` typewriter, an IntersectionObserver that only exists to
 * trigger a reveal. Anything JS-driven must ask this and render a still frame
 * instead, not merely animate faster.
 *
 * Subscribed rather than read once: the preference can change while the page is
 * open (macOS ▸ Accessibility ▸ Display ▸ Reduce motion is a live toggle), and
 * a hero that keeps drifting after it is switched on is the exact complaint.
 *
 * The initial value is read lazily so it is correct on the first render rather
 * than one paint late, and guarded because `matchMedia` does not exist in every
 * environment this code is imported into (the vitest jsdom setup stubs it, but
 * a bare Node import would not).
 */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener('change', onChange);
    setReduced(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
};
