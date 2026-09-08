import type { ComponentType } from 'react';

import { Hero } from './hero/hero';
import { placeholderSection } from './placeholder';

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
 * **To fill in a section:** replace its `Component` with the real one and
 * delete its `placeholderSection(...)` call. Leave the `id`, the `label` and
 * the position alone — the id is a published URL fragment, and the order is a
 * decision the page has already made.
 *
 * `hero` is deliberately not in the nav: it is where the logo already links to,
 * and a "Hero" item in a navigation bar means nothing to a visitor. `footer` is
 * not either, for the obvious reason.
 */
export const SECTIONS: readonly SectionEntry[] = [
  { id: 'hero', label: 'Midnite Studio', Component: Hero },
  {
    id: 'features',
    label: 'Features',
    Component: placeholderSection('features', 'What it does'),
    nav: true,
  },
  {
    id: 'trusted',
    label: 'Built on',
    Component: placeholderSection('trusted', 'Built on'),
    nav: true,
  },
  {
    id: 'services',
    label: 'Services',
    Component: placeholderSection('services', 'Services'),
    nav: true,
  },
  {
    id: 'testimonials',
    label: 'Notes',
    Component: placeholderSection('testimonials', 'Notes from the build'),
    nav: true,
  },
  { id: 'faq', label: 'FAQ', Component: placeholderSection('faq', 'FAQ'), nav: true },
  {
    id: 'early-access',
    label: 'Early access',
    Component: placeholderSection('early-access', 'Early access'),
    nav: true,
  },
  { id: 'footer', label: 'Footer', Component: placeholderSection('footer', 'Footer') },
];

/** The nav's anchor list — the registry, filtered, in page order. */
export const NAV_SECTIONS = SECTIONS.filter((section) => section.nav);
