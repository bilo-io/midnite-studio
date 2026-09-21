import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Footer } from '../sections/footer/footer';
import { SECTIONS } from '../sections/registry';

import {
  INDIVIDUAL_PRICE_USD,
  PricingPage,
  TEAM_MIN_SEATS,
  TEAM_PRICE_PER_SEAT_USD,
} from './pricing-page';

describe('PricingPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders three tier columns with the settled prices', () => {
    render(<PricingPage />);
    const columns = screen.getByTestId('pricing-columns');
    expect(columns.querySelectorAll('.rounded-lg')).toHaveLength(3);
    expect(screen.getByText(`$${INDIVIDUAL_PRICE_USD}`)).toBeDefined();
    expect(screen.getByText(`$${TEAM_PRICE_PER_SEAT_USD}`)).toBeDefined();
    expect(screen.getByText(new RegExp(`${TEAM_MIN_SEATS}-seat minimum`))).toBeDefined();
  });

  it('routes every CTA to the early-access form on the landing page', () => {
    const { container } = render(<PricingPage />);
    const ctas = [...container.querySelectorAll('a[href="/#early-access"]')];
    expect(ctas.length).toBeGreaterThanOrEqual(3);
  });

  it('names the higher-tier footnote without inventing a fourth priced column', () => {
    render(<PricingPage />);
    expect(screen.getByText(/Councils, Workflows and the Video Editor/i)).toBeDefined();
    expect(screen.getAllByText(/\$\d+/)).toHaveLength(3);
  });

  it('renders the site footer, and the very same component the registry does', () => {
    render(<PricingPage />);
    expect(document.getElementById('footer')).not.toBeNull();
    expect(SECTIONS.find((section) => section.id === 'footer')?.Component).toBe(Footer);
  });

  it('never links to the private repo, footer included', () => {
    const { container } = render(<PricingPage />);
    const hrefs = [...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.includes('bilo-io/midnite-studio'))).toBe(false);
  });
});
