import type { ReactNode } from 'react';

import { Container } from './container';

export type SectionProps = {
  /**
   * The anchor id. This is also the registry key and what the nav links to, so
   * it must match the `id` in `sections/registry.ts` exactly.
   */
  id: string;
  /** Names the region for assistive tech. Defaults to the id. */
  label?: string;
  children: ReactNode;
  /** Appended to the `<section>` — for a background, not for spacing. */
  className?: string;
  /** Drops the built-in vertical padding, for a section that fills the screen. */
  bare?: boolean;
};

/**
 * One band of the page: the anchor target, the vertical rhythm and the measure.
 *
 * Vertical padding lives here rather than on each section so the gaps down the
 * page are identical without anyone maintaining them. `bare` is the escape
 * hatch for a section that owns its own full-height layout — the hero — and it
 * still gets the id and the landmark.
 *
 * `scroll-mt-20` matters: the nav is sticky, and without it an anchor jump puts
 * the section's heading behind the nav rather than under it.
 */
export const Section = ({ id, label, children, className = '', bare = false }: SectionProps) => (
  <section
    id={id}
    aria-label={label ?? id}
    className={`scroll-mt-20 ${bare ? '' : 'py-20 sm:py-28'} ${className}`}
  >
    {bare ? children : <Container>{children}</Container>}
  </section>
);
