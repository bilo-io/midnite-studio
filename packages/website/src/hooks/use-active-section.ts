import { useEffect, useState } from 'react';

/**
 * The observer band, as a `rootMargin`.
 *
 * Shrinking the root by 40% from the top and 55% from the bottom leaves a 5%-tall
 * strip sitting just above the vertical middle of the viewport. A section counts
 * as "in view" while it crosses that strip, which is the band a reader's eye is
 * actually in — not the band the *top* of the viewport is in, which would light
 * up the next section the instant its first pixel appeared, and not the whole
 * viewport, which on a tall screen is three sections at once.
 *
 * Asymmetric on purpose: the strip is above centre rather than on it, because the
 * heading a reader is working through sits above the middle of the screen by the
 * time its body copy is being read.
 */
const DEFAULT_ROOT_MARGIN = '-40% 0px -55% 0px';

export type UseActiveSectionOptions = {
  /** Override the band. Same string an `IntersectionObserver` takes. */
  rootMargin?: string;
};

/** The fragment of the current URL, or `null` when there isn't one. */
const hashId = (): string | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash;
  if (raw.length < 2) return null;
  try {
    return decodeURIComponent(raw.slice(1));
  } catch {
    return raw.slice(1);
  }
};

/**
 * Which of `ids` is the section the reader is currently in — for scroll-spy.
 *
 * **One `IntersectionObserver` for every section, and no per-scroll work.** The
 * naive implementation of this is a `scroll` listener that reads
 * `getBoundingClientRect()` on each section on every event; that is a forced
 * layout per frame during the one interaction where the main thread is already
 * the bottleneck. Here the browser does the geometry off-thread and only calls
 * back when a section enters or leaves the band — a handful of times over a
 * whole page's scroll, rather than sixty times a second.
 *
 * **The fallback.** A 5%-tall band means zero sections intersect it whenever a
 * boundary happens to be crossing it, and more than one whenever a section is
 * shorter than the band. Neither is an error, and neither may blank the nav — so
 * in both cases the answer is *the last section, in page order, whose top edge is
 * at or above the viewport's midline*: the one the reader has most recently
 * scrolled into. That rule reads geometry, but only inside the observer callback
 * (a few times per page), never on a scroll event.
 *
 * **Deep links start correct.** The initial state is seeded from
 * `location.hash`, so a visitor arriving at `/#faq` sees FAQ marked on the first
 * paint rather than one observer tick later.
 *
 * **An empty `ids` disables it entirely** and the result is always `null`. That
 * is how the download page — which shows the same nav, pointing back at the
 * landing page's fragments — ends up with nothing marked: there is no section on
 * that page to be in.
 *
 * Returns `null` rather than a guess when `IntersectionObserver` is missing
 * (jsdom without a stub, older engines): the nav is fully usable with nothing
 * highlighted, and a wrong highlight is worse than none.
 */
export const useActiveSection = (
  ids: readonly string[],
  { rootMargin = DEFAULT_ROOT_MARGIN }: UseActiveSectionOptions = {},
): string | null => {
  /*
    `ids` is almost always a fresh array literal from the caller's render, so it
    cannot be an effect dependency directly. Joining it on NUL gives a primitive
    that changes exactly when the contents do — the same trick, and the same
    delimiter, the repo's git parsing uses, and for the same reason: a section id
    can contain a hyphen ('early-access') but never a NUL.
  */
  const key = ids.join('\u0000');

  const [active, setActive] = useState<string | null>(() => {
    const fromHash = hashId();
    return fromHash !== null && ids.includes(fromHash) ? fromHash : null;
  });

  useEffect(() => {
    const wanted = key.length > 0 ? key.split('\u0000') : [];
    if (wanted.length === 0) {
      setActive(null);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') return;

    const elements = wanted
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    /*
      The observer callback is handed only the entries that *changed*, so the
      current intersecting set has to be remembered between calls. A Map keyed by
      element rather than by id, because that is what an entry carries.
    */
    const intersecting = new Map<Element, boolean>();
    for (const element of elements) intersecting.set(element, false);

    const pick = (): string | null => {
      const hits = elements.filter((element) => intersecting.get(element) === true);
      const [first] = hits;
      if (first !== undefined && hits.length === 1) return first.id;

      // Several, or none: the last one whose top edge has passed the midline.
      const midline = window.innerHeight / 2;
      const pool = hits.length > 1 ? hits : elements;
      let chosen: HTMLElement | null = null;
      for (const element of pool) {
        if (element.getBoundingClientRect().top <= midline) chosen = element;
      }
      if (chosen !== null) return chosen.id;

      // Everything in the band still starts below the midline (a short first
      // section at the very top of the page): take the topmost hit, if any.
      return first?.id ?? null;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) intersecting.set(entry.target, entry.isIntersecting);
        setActive(pick());
      },
      { rootMargin, threshold: 0 },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [key, rootMargin]);

  return active;
};
