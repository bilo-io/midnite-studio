import { useEffect } from 'react';

/**
 * Scroll to the fragment in the URL, once, after the sections exist.
 *
 * **The browser cannot do this for us here.** Fragment scrolling happens while
 * the HTML is parsed, and `index.html` ships an empty `#root` — every section on
 * this page is rendered by React a moment later, so at the point the browser
 * looks for `#faq` there is nothing in the document with that id and it gives
 * up. It does not retry. The visible symptom is a deep link that loads the
 * right page at the wrong place: the top.
 *
 * That is not a hypothetical. The nav on `/download` links back to `/#features`
 * and friends — real cross-page navigations, since the two pages are separate
 * HTML files — and every one of them landed on the hero until this ran.
 *
 * **`behavior: 'instant'`, not `'auto'`.** `auto` means "whatever
 * `scroll-behavior` says", and `styles/site.css` sets `smooth` on `html` — so
 * `auto` would animate a scroll the visitor never asked for, from a position
 * they never saw. `instant` is a deep link arriving where it was pointed.
 *
 * **Skipped when the page is already scrolled.** A reload, or a Back that
 * restores a position, both leave `scrollY` non-zero before this runs, and
 * neither should be dragged back to the fragment.
 *
 * `scroll-mt-20` on `Section` is what keeps the heading out from under the
 * sticky nav; there is no offset arithmetic here for the same reason there is
 * none in an ordinary anchor jump.
 */
export const useHashLanding = (enabled = true) => {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (window.scrollY > 0) return;

    const raw = window.location.hash;
    if (raw.length < 2) return;

    let id: string;
    try {
      id = decodeURIComponent(raw.slice(1));
    } catch {
      id = raw.slice(1);
    }

    document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [enabled]);
};
