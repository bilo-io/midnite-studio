import { useEffect, useState, type RefObject } from 'react';

/**
 * The width of the element `ref` points at, kept current by a `ResizeObserver` (the repo has no
 * container queries). `Infinity` until measured, and in jsdom where the observer is absent, so a
 * test sees the widest layout.
 */
export function usePanelWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState<number>(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    setWidth(el.getBoundingClientRect().width || Number.POSITIVE_INFINITY);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (typeof next === 'number') setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
