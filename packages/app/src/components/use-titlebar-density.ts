import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { densityFor, type Density } from '../lib/density';

/**
 * How much the title bar's agent cluster can afford to show, decided from
 * whether the **whole bar** is over budget.
 *
 * `@bilo-io/shell`'s `<TitleBar>` gives its left slot `md:shrink-0` and its
 * right slot `shrink-0`, so a bar whose content exceeds the window does not
 * squeeze — it overflows past the right edge and takes the last control in the
 * right cluster with it. Measured against the mocked renderer with one live
 * agent, the bar wants 1138px (left slot 532, right slot 511) and the agent
 * cluster is 105px of that; below ~1138px the theme toggle was leaving the
 * viewport entirely. Nothing in the shell will catch that, so the cluster has
 * to give the width back itself.
 *
 * **The measured element is the header, the stamped element is the cluster** —
 * which is the one thing this cannot borrow from
 * `features/status-bar/use-overflow.ts`, where they are the same node. The
 * decision itself is not reimplemented: `densityFor` in
 * [`lib/density.ts`](../lib/density.ts) owns every threshold and the 24px
 * hysteresis band, and `density.test.ts` drives it with plain numbers.
 *
 * The probe is the same trick `useOverflow` uses: stamp the cluster `full`,
 * read the header's `scrollWidth`, stamp it `compact`, read again. Two extra
 * layout reads per resize — not per frame — against a 48px bar.
 *
 * `ResizeObserver` on the header rather than on the window: the bar is
 * `position: fixed inset-x-0`, so its width tracks the window today, but the
 * observer costs the same and keeps this honest if the shell ever insets it.
 * jsdom has no `ResizeObserver` and nothing in this repo stubs one, so the
 * observer half is covered by `e2e/titlebar-agents.spec.ts` rather than a
 * rendered-component test — the precedent `use-overflow.ts` sets and states.
 */
export function useTitleBarDensity(ref: RefObject<HTMLElement | null>): Density {
  const [density, setDensity] = useState<Density>('full');
  const densityRef = useRef<Density>(density);
  densityRef.current = density;

  /*
    The last reading taken while the cluster was genuinely mounted at each
    step. At `collapsed` the count is display:none, so probing `compact` no
    longer answers "what does compact want" — it answers "what does compact
    want with the count gone", which is `collapsed`'s own width and can never
    satisfy the restore hysteresis. Same trap `useOverflow` documents: a
    resize that dips through `collapsed` and back would stick there forever.
  */
  const lastWidths = useRef<{ fullWidth: number; compactWidth: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const header = el?.closest('header');
    if (!el || !header) return;

    const measure = () => {
      const available = header.clientWidth;
      const current = densityRef.current;

      let fullWidth: number;
      let compactWidth: number;
      if (current === 'collapsed' && lastWidths.current) {
        ({ fullWidth, compactWidth } = lastWidths.current);
      } else {
        const restore = el.dataset.density;
        el.dataset.density = 'full';
        fullWidth = header.scrollWidth;
        el.dataset.density = 'compact';
        compactWidth = header.scrollWidth;
        el.dataset.density = restore;
        lastWidths.current = { fullWidth, compactWidth };
      }

      const next = densityFor({ available, fullWidth, compactWidth }, current);
      if (next !== current) setDensity(next);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [ref]);

  return density;
}
