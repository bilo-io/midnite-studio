import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Below this width a two-column split stops fitting.
 *
 * Two 80-column monospace cells at the diff's own `text-xs`/`font-mono`
 * metrics, plus two gutters, is what stops fitting below this width — and it
 * is not a guess: it is the same width `LAYOUT_BOUNDS.detailWidth` already
 * caps the graph dock at, so the one surface the phase's framing prose called
 * too narrow is the boundary case by construction.
 */
export const DIFF_SPLIT_MIN_WIDTH = 720;

/**
 * True once the observed element's own width drops below
 * `DIFF_SPLIT_MIN_WIDTH` — the width fallback Theme C's own build skipped.
 *
 * `ResizeObserver` on the element itself, never `window`: three of split's
 * four surfaces sit inside resizable panels (the commit inspector's dock, the
 * accordion's own pane), so window width does not describe them.
 *
 * The stored `diffLayout` preference is never touched here — that is the
 * caller's job, and precisely the point: widening the panel back past the
 * threshold must restore split with no second click, which only holds if
 * nothing here ever rewrites what the user actually asked for.
 *
 * Same shape as `useTitleBarDensity` (`components/use-titlebar-density.ts`):
 * `useLayoutEffect` so a resize during the same paint cannot flash the wrong
 * layout, and jsdom's lack of `ResizeObserver` is a documented gap covered by
 * `e2e/diff-split.spec.ts` rather than a rendered-component test.
 */
export function useTooNarrowForSplit(ref: RefObject<HTMLElement | null>): boolean {
  const [tooNarrow, setTooNarrow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setTooNarrow(el.clientWidth < DIFF_SPLIT_MIN_WIDTH);

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return tooNarrow;
}
