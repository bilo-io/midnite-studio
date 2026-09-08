import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SECTIONS } from '../registry';

import { SERVICE_ROWS } from './rows';
import { Services } from './services';

describe('the Services section', () => {
  it('is the registry entry for `services`', () => {
    expect(SECTIONS.find((section) => section.id === 'services')?.Component).toBe(Services);
  });

  it('anchors on the registry id and keeps its nav entry', () => {
    const entry = SECTIONS.find((section) => section.id === 'services');
    expect(entry?.nav).toBe(true);

    const { container } = render(<Services />);
    expect(container.querySelector('section#services')).not.toBeNull();
  });

  it('renders every row, titled and labelled by its own heading', () => {
    render(<Services />);
    for (const { id, title } of SERVICE_ROWS) {
      const heading = screen.getByRole('heading', { name: title, level: 3 });
      expect(heading.id).toBe(`service-${id}-title`);
      expect(screen.getByRole('article', { name: title })).toBeDefined();
    }
  });

  it('gives every row a How it works list with every item', () => {
    render(<Services />);
    expect(screen.getAllByText('How it works')).toHaveLength(SERVICE_ROWS.length);
    for (const { how } of SERVICE_ROWS) {
      for (const item of how) {
        expect(screen.getByText(item)).toBeDefined();
      }
    }
  });

  it('alternates the drawing to the other side on the middle row only', () => {
    // The markup order is always copy-then-drawing so the one-column layout
    // reads correctly; the swap is `lg:order-*` and nothing else. Asserting the
    // classes is the only way to catch a regression that flips the *markup*
    // order instead, which looks identical on a desktop and puts a decorative
    // SVG above the heading on a phone.
    const { container } = render(<Services />);
    const articles = [...container.querySelectorAll('article')];
    expect(articles).toHaveLength(SERVICE_ROWS.length);

    const flipped = articles.map((article) => article.innerHTML.includes('lg:order-1'));
    expect(flipped).toEqual([false, true, false]);
  });

  it('draws its illustrations rather than loading an image', () => {
    // Every row's art is inline SVG built from the design tokens: no request,
    // no second file to keep in step with the UI, and both themes for free.
    const { container } = render(<Services />);
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(SERVICE_ROWS.length);
    expect(container.querySelector('img')).toBeNull();
    for (const svg of container.querySelectorAll('svg[role="img"]')) {
      expect(svg.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(20);
    }
  });
});
