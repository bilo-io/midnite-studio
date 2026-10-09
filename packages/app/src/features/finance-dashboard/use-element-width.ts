import { useEffect, useState } from 'react';

/**
 * The width of an element, kept current as it is resized.
 *
 * The dashboard's cards are user-resizable, so "is there room for the absolute
 * gain beside the percentage" cannot be answered by a media query — a card's
 * width has nothing to do with the window's. A ResizeObserver on the card's own
 * content box is the honest source.
 *
 * Returns a *callback* ref rather than a ref object: the element it measures can
 * mount after the first render (the lists show a skeleton first), and an effect
 * keyed on a ref object's `current` would never notice. Under jsdom (no
 * ResizeObserver) the width is `Infinity`, so tests render the roomy layout.
 */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState<number>(Number.POSITIVE_INFINITY);

  useEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (typeof next === 'number' && next > 0) setWidth(Math.round(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, width];
}
