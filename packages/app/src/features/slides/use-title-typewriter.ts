import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Types `title` out one character at a time, restarting whenever it changes —
 * ported from midnite's `Deck` title effect
 * (`~/Dev/midnite/packages/web/components/slides/deck.tsx:56-84`). Steps do
 * not get this treatment (Theme A/B's resolved decision: they are real
 * `react-markdown` fragments now, not `innerHTML` being sliced, so there is no
 * `sliceHtml`/`visibleLen` left to port for them) — only the title, which is
 * plain text throughout.
 *
 * `instant` shows the full title with no typing at all — set by the caller
 * for a backward/jump navigation, matching the crib's own `instantRef` rule.
 * Respects `prefers-reduced-motion` the same way.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useTitleTypewriter(title: string, instant: boolean) {
  /*
    Lazily initialized to the CORRECT resting state, not a placeholder the
    effect corrects a tick later. `useState(true)` for `done` would default
    every fresh title to "already typed" until the first effect runs — a
    keydown landing in that gap (mount, or a fast slide change) reads a title
    that is visually mid-type as `done`, which used to route it into `next()`
    instead of `complete()`.
  */
  const [typed, setTyped] = useState(() => (instant || prefersReducedMotion() || !title ? title : ''));
  const [done, setDone] = useState(() => instant || prefersReducedMotion() || !title);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (instant || prefersReducedMotion() || !title) {
      setTyped(title);
      setDone(true);
      return;
    }

    setTyped('');
    setDone(false);
    let i = 0;
    const perChar = Math.max(16, Math.min(42, Math.round(720 / title.length)));
    intervalRef.current = setInterval(() => {
      i += 1;
      setTyped(title.slice(0, i));
      if (i >= title.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setDone(true);
      }
    }, perChar);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [title, instant]);

  const complete = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTyped(title);
    setDone(true);
  }, [title]);

  return { typed, done, complete };
}
