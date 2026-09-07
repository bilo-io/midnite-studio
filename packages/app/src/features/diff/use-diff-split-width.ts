import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

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
 * **No dependency array** — deliberately, and it is the whole reason this
 * needs its own ref-tracking rather than `useTitleBarDensity`'s plain
 * `[ref]`. `ref` (the object `useRef` returns) never changes, so `[ref]`
 * would only ever check `ref.current` once, at the very first commit. Every
 * caller here attaches the ref to an element that can be ABSENT on that
 * first commit: `DiffView`'s own `isLoading`/`!diff` early returns render
 * nothing at all until the diff query resolves, and an accordion's body
 * exists only while `open`. Re-checking `ref.current` on every render is
 * what catches it resolving later — cheaply, because `observedRef` below
 * skips the actual `ResizeObserver` churn unless the element itself changed.
 *
 * jsdom's lack of `ResizeObserver` is a documented gap covered by
 * `e2e/diff-split.spec.ts` rather than a rendered-component test — the same
 * precedent `useTitleBarDensity` states for its own observer half.
 */
export function useTooNarrowForSplit(ref: RefObject<HTMLElement | null>): boolean {
  const [tooNarrow, setTooNarrow] = useState(false);
  const observedRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === observedRef.current) return;
    observedRef.current = el;

    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!el) return;

    const measure = () => setTooNarrow(el.clientWidth < DIFF_SPLIT_MIN_WIDTH);
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observerRef.current = observer;
  });

  // Unmount only — the effect above already tears down and replaces the
  // observer whenever the observed element itself changes.
  useLayoutEffect(() => () => observerRef.current?.disconnect(), []);

  return tooNarrow;
}
