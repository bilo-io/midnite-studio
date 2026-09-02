import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { densityFor, type Density } from '../../lib/density';

/**
 * Measures the bar element itself, not the window — the repositories panel
 * goes to 560px (`LAYOUT_BOUNDS.reposWidth`) and the browser pane can cover
 * the whole content row, so the window's width stops predicting the bar's
 * the moment either moves. Follows `app.tsx`'s `stackHeight` pattern: a
 * `useLayoutEffect`, one measurement before the observer is attached so the
 * first paint is already correct, and the same
 * `typeof ResizeObserver === 'undefined'` guard.
 *
 * A thin wrapper by design: it owns the measuring, not the deciding — every
 * threshold and the hysteresis band live in the pure `densityFor`, which is
 * what `density.test.ts` drives directly. jsdom has no `ResizeObserver` and
 * no test file in this repo stubs one, so this hook is covered by the
 * Playwright suite (Theme H) rather than a rendered-component test.
 *
 * Returns `remeasure` alongside the density (Phase 39) for content changes the
 * `ResizeObserver` cannot see. The observer watches this element, and hiding a
 * stranded group separator does not change its `clientWidth` — so without a way
 * to ask again, the cached `lastWidths` would keep an inflated reading (a 1px
 * rule plus its 12px `gap-3` slot per pruned separator) and the bar could sit
 * one density step narrower than its content warrants until the next window
 * resize. A callback rather than a `revision` counter: a counter meant
 * `setState` inside a dependency-free layout effect, which is an infinite-update
 * hazard even when the producing function is idempotent, and it cost an extra
 * render per prune.
 */
export function useOverflow(ref: RefObject<HTMLElement | null>): {
  density: Density;
  remeasure: () => void;
} {
  const [density, setDensity] = useState<Density>('full');
  const densityRef = useRef<Density>(density);
  densityRef.current = density;

  /*
    The last `fullWidth`/`compactWidth` reading taken while every segment was
    genuinely mounted. At `collapsed`, a zone's segments are gone from the
    DOM (`collapseFor`), so `el.scrollWidth` no longer answers "what does the
    full set want" — it answers "what does the empty set want", which
    shrinks to fit `available` by construction and can never satisfy the
    restore hysteresis. A resize that dips through `collapsed` and back
    (real: Chromium reports intermediate widths mid-resize, not one atomic
    jump) would otherwise get stuck collapsed forever, because removing
    content doesn't itself change the bar's own `clientWidth` and so never
    fires the observer again on its own. Reusing the last trustworthy
    reading keeps the decision honest without measuring a DOM that is
    currently lying about what it wants.
  */
  const lastWidths = useRef<{ fullWidth: number; compactWidth: number } | null>(null);

  /*
    The live `measure`, so a caller outside this hook can trigger one. Held in a
    ref because `measure` closes over the element and is rebuilt by the effect;
    the exported `remeasure` stays a stable identity, which is what lets
    `status-bar.tsx` hand it over during render.
  */
  const measureRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const available = el.clientWidth;
      const current = densityRef.current;

      let fullWidth: number;
      let compactWidth: number;
      if (current === 'collapsed' && lastWidths.current) {
        ({ fullWidth, compactWidth } = lastWidths.current);
      } else {
        /*
          Read while the `compact` classes are applied — one extra layout
          read per resize, not per frame, which at a 24px bar is not a
          budget worth defending. `fullWidth` is read the same way rather
          than trusted to whatever `data-density` the element already
          carries, so a measurement taken mid-compact still gets an honest
          number for both ends.
        */
        const restore = el.dataset.density;
        el.dataset.density = 'full';
        fullWidth = el.scrollWidth;
        el.dataset.density = 'compact';
        compactWidth = el.scrollWidth;
        el.dataset.density = restore;
        lastWidths.current = { fullWidth, compactWidth };
      }

      const next = densityFor({ available, fullWidth, compactWidth }, current);
      if (next !== current) setDensity(next);
    };

    measureRef.current = measure;
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      measureRef.current = () => {};
    };
  }, [ref]);

  const remeasure = useCallback(() => measureRef.current(), []);

  return { density, remeasure };
}
