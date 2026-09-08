import { useEffect, useRef, useState } from 'react';

export type UseInViewOptions = {
  /** How much of the element must be visible before it counts. */
  threshold?: number;
  /** Shrinks the viewport so the reveal fires slightly before the true edge. */
  rootMargin?: string;
};

export type UseInView<T extends Element> = {
  ref: React.RefObject<T | null>;
  inView: boolean;
};

/**
 * One-shot "has this scrolled into view yet", for reveal-on-scroll.
 *
 * Pair it with the `.ws-reveal` / `.ws-reveal-in` utilities in
 * `styles/site.css`: the resting style is the hidden one, so an element that
 * never enters the viewport simply stays where it is, and adding `ws-reveal-in`
 * transitions it. Under reduced motion the duration tokens are zero, so the
 * class swap is instantaneous and nothing appears to move.
 *
 * **One-shot deliberately.** The observer disconnects on the first intersection
 * rather than tracking the element in and out. A section that re-fades every
 * time it is scrolled past is a section that fights the reader on the way back
 * up, and it also means the observer count stays bounded by the number of
 * sections rather than living for the length of the visit.
 *
 * Falls open when `IntersectionObserver` is missing (jsdom, older engines):
 * `inView` starts `true` in that case, so the content is visible rather than
 * permanently transparent. Failing towards "shown" is the only safe direction
 * for a hide-then-reveal pattern.
 */
export const useInView = <T extends Element>({
  threshold = 0.15,
  rootMargin = '0px 0px -10% 0px',
}: UseInViewOptions = {}): UseInView<T> => {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { ref, inView };
};
