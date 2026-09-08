import type { ComponentType } from 'react';

import { EarlyAccess } from './early-access/early-access';
import { Faq } from './faq/faq-section';
import { Features } from './features/features';
import { Footer } from './footer/footer';
import { Hero } from './hero/hero';
import { Services } from './services/services';
import { Testimonials } from './testimonials/testimonials';
import { Trusted } from './trusted/trusted';

export type SectionEntry = {
  /**
   * The anchor id. Also the `id` passed to `Section`, and the fragment the nav
   * links to — the three must agree, so there is exactly one of them.
   */
  id: string;
  /** The nav label and the section's accessible name. */
  label: string;
  /** Rendered in place, in this array's order. */
  Component: ComponentType;
  /** `true` puts it in the top nav's anchor list. */
  nav?: boolean;
};

/**
 * The landing page, top to bottom.
 *
 * `app.tsx` maps this into `<main>` and the nav reads the `nav: true` entries
 * for its anchor links. That is the whole mechanism: **a flat, ordered array,
 * on purpose.** No nesting, no lazy imports, no per-section config object.
 * Several agents append to this file in parallel, and the one thing a flat
 * array guarantees is that two of them editing different rows produce a
 * conflict a human can read.
 *
 * **Every row is a real section as of wave 2** — this file no longer imports
 * `placeholderSection`, which is what put the last of the three wave-2 branches
 * in the position of removing an import the other two still needed.
 * `sections/placeholder.tsx` stays where it is: it is the stand-in for the next
 * section somebody adds, and its own test still covers it.
 *
 * **To add one:** append a row with its `id`, `label` and `Component`, in the
 * position the page should show it. To fill an existing one in, replace its
 * `Component` and leave the `id`, the `label` and the position alone — the id is
 * a published URL fragment, and the order is a decision the page has made.
 *
 * `hero` is deliberately not in the nav: it is where the logo already links to,
 * and a "Hero" item in a navigation bar means nothing to a visitor. `footer` is
 * not either, for the obvious reason.
 */
export const SECTIONS: readonly SectionEntry[] = [
  { id: 'hero', label: 'Midnite Studio', Component: Hero },
  { id: 'features', label: 'Features', Component: Features, nav: true },
  /*
    The label is "Agents", not wave 1's "Built on": the band is the app's agent
    roster under the heading "Use your favourite agents", and "Built on" reads
    as a tech-stack credit — a different section nobody is building. The `id`
    stays `trusted`, because it is a published URL fragment.
  */
  { id: 'trusted', label: 'Agents', Component: Trusted, nav: true },
  { id: 'services', label: 'Services', Component: Services, nav: true },
  { id: 'testimonials', label: 'Notes', Component: Testimonials, nav: true },
  { id: 'faq', label: 'FAQ', Component: Faq, nav: true },
  { id: 'early-access', label: 'Early access', Component: EarlyAccess, nav: true },
  { id: 'footer', label: 'Footer', Component: Footer },
];

/** The nav's anchor list — the registry, filtered, in page order. */
export const NAV_SECTIONS = SECTIONS.filter((section) => section.nav);

/**
 * Just the nav entries' ids, in page order — what the scroll-spy observes.
 *
 * Derived here rather than mapped at the call site so the nav and the observer
 * cannot drift: the set of sections that get a nav item and the set the
 * highlight can land on are the same set by construction.
 */
export const NAV_SECTION_IDS: readonly string[] = NAV_SECTIONS.map((section) => section.id);
