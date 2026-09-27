import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Footer } from '../sections/footer/footer';
import { SECTIONS } from '../sections/registry';

import {
  MAX_MONTHLY_USD,
  MAX_YEARLY_USD,
  PRO_MONTHLY_USD,
  PRO_YEARLY_USD,
  PRO_SESSION_LIMIT,
  PricingPage,
  STARTER_SESSION_LIMIT,
  YEARLY_DISCOUNT_LABEL,
} from './pricing-page';

/** Yearly total / 12, formatted the same way `pricing-page.tsx`'s own `formatUsd` does. */
const effectiveMonthly = (yearlyUsd: number): string => {
  const amount = yearlyUsd / 12;
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
};

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

  it('renders three tier columns with their names and subtitles', () => {
    render(<PricingPage />);
    const columns = screen.getByTestId('pricing-columns');
    expect(within(columns).getByText('Starter')).toBeDefined();
    expect(within(columns).getByText('Early riser')).toBeDefined();
    expect(within(columns).getByText('Pro')).toBeDefined();
    expect(within(columns).getByText('Nightowl')).toBeDefined();
    expect(within(columns).getByText('Max')).toBeDefined();
    expect(within(columns).getByText('Insomniac')).toBeDefined();
  });

  it('defaults to yearly billing', () => {
    render(<PricingPage />);
    const toggle = screen.getByRole('switch', { name: /toggle monthly or yearly billing/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('shows Starter as Free in both billing modes', () => {
    render(<PricingPage />);
    const columns = screen.getByTestId('pricing-columns');
    expect(within(columns).getByText('Free')).toBeDefined();

    fireEvent.click(screen.getByRole('switch', { name: /toggle monthly or yearly billing/i }));
    expect(within(columns).getByText('Free')).toBeDefined();
  });

  it('the -17% badge is derived, and equal for both paid tiers', () => {
    // $72 -> $60 (Pro) and $120 -> $100 (Max) are both a 16.67% saving,
    // rounded to the same whole-number badge — not two independent figures.
    expect(YEARLY_DISCOUNT_LABEL).toBe('-17%');
    expect(Math.round((1 - PRO_YEARLY_USD / (PRO_MONTHLY_USD * 12)) * 100)).toBe(17);
    expect(Math.round((1 - MAX_YEARLY_USD / (MAX_MONTHLY_USD * 12)) * 100)).toBe(17);
  });

  it('Yearly headlines the effective monthly price next to the struck-through monthly price, with fine print', () => {
    render(<PricingPage />);
    const columns = screen.getByTestId('pricing-columns');

    // Pro: $6 struck, $5/mo headline, "billed annually ($60/yr)" fine print.
    expect(within(columns).getByText(`$${PRO_MONTHLY_USD}`)).toBeDefined();
    expect(within(columns).getByText(effectiveMonthly(PRO_YEARLY_USD))).toBeDefined();
    expect(screen.getByTestId('pro-fine-print').textContent).toBe(
      `billed annually ($${PRO_YEARLY_USD}/yr)`,
    );

    // Max: $10 struck, $8.33/seat/mo headline, "billed annually ($100/seat/yr)" fine print.
    expect(within(columns).getByText(`$${MAX_MONTHLY_USD}`)).toBeDefined();
    expect(within(columns).getByText(effectiveMonthly(MAX_YEARLY_USD))).toBeDefined();
    expect(screen.getByTestId('max-fine-print').textContent).toBe(
      `billed annually ($${MAX_YEARLY_USD}/seat/yr)`,
    );
  });

  it('toggling to monthly shows the plain monthly price with no struck-through figure, badge or fine print', () => {
    render(<PricingPage />);
    const toggle = screen.getByRole('switch', { name: /toggle monthly or yearly billing/i });
    const columns = screen.getByTestId('pricing-columns');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(within(columns).getByText(`$${PRO_MONTHLY_USD}`)).toBeDefined();
    expect(within(columns).getByText(`$${MAX_MONTHLY_USD}`)).toBeDefined();
    expect(within(columns).queryByText(effectiveMonthly(PRO_YEARLY_USD))).toBeNull();
    expect(within(columns).queryByText(effectiveMonthly(MAX_YEARLY_USD))).toBeNull();
    expect(screen.queryByTestId('pro-fine-print')).toBeNull();
    expect(screen.queryByTestId('max-fine-print')).toBeNull();
    expect(screen.queryByTestId('yearly-toggle-badge')).toBeNull();
    expect(screen.queryByTestId('pro-discount-badge')).toBeNull();
    expect(screen.queryByTestId('max-discount-badge')).toBeNull();
  });

  it('toggling back to yearly restores the discount badges', () => {
    render(<PricingPage />);
    const toggle = screen.getByRole('switch', { name: /toggle monthly or yearly billing/i });

    fireEvent.click(toggle); // -> monthly
    fireEvent.click(toggle); // -> yearly

    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('yearly-toggle-badge').textContent).toBe(YEARLY_DISCOUNT_LABEL);
    expect(screen.getByTestId('pro-discount-badge').textContent).toBe(YEARLY_DISCOUNT_LABEL);
    expect(screen.getByTestId('max-discount-badge').textContent).toBe(YEARLY_DISCOUNT_LABEL);
  });

  it('never shows the -17% badge on the free Starter card', () => {
    render(<PricingPage />);
    expect(screen.queryByTestId('starter-discount-badge')).toBeNull();
  });

  it('puts the Recommended tag on Pro only, as the solid-fill pill', () => {
    render(<PricingPage />);
    const columns = screen.getByTestId('pricing-columns');
    expect(within(columns).getAllByText('Recommended')).toHaveLength(1);
    expect(screen.getByTestId('pricing-recommended-pill')).toBeDefined();
  });

  it('straddles the pill on the Pro card’s top-centre edge, on an overflow-visible card', () => {
    render(<PricingPage />);
    const pill = screen.getByTestId('pricing-recommended-pill');
    // Anchored to the card's top-centre, then pulled back by half its own
    // box in both axes — half above the border, half inside it.
    expect(pill.className).toContain('absolute');
    expect(pill.className).toContain('left-1/2');
    expect(pill.className).toContain('top-0');
    expect(pill.className).toContain('-translate-x-1/2');
    expect(pill.className).toContain('-translate-y-1/2');

    // The Pro card must not clip the half that sits above its border.
    const card = pill.parentElement;
    expect(card).not.toBeNull();
    expect(card!.className).toContain('overflow-visible');
  });

  it('routes every card CTA to the early-access form on the landing page', () => {
    const { container } = render(<PricingPage />);
    const ctas = [...container.querySelectorAll('a[href="/#early-access"]')];
    expect(ctas.length).toBeGreaterThanOrEqual(3);
  });

  it('renders a comparison table with a header per tier and the expected checkmarks', () => {
    render(<PricingPage />);
    const table = screen.getByTestId('pricing-table');
    const headers = within(table).getAllByRole('columnheader');
    // "Feature" plus the three tiers.
    expect(headers.map((header) => header.textContent)).toEqual(['Feature', 'Starter', 'Pro', 'Max']);

    // "Private repositories" is Starter-excluded, Pro/Max-included.
    const privateRepoRow = within(table).getByRole('row', { name: /private repositories/i });
    const cells = within(privateRepoRow).getAllByRole('cell');
    expect(within(cells[0]!).queryByText('Included')).toBeNull();
    expect(within(cells[1]!).getByText('Included', { selector: '.sr-only' })).toBeDefined();
    expect(within(cells[2]!).getByText('Included', { selector: '.sr-only' })).toBeDefined();

    // "Unlimited public repositories" is included in all three.
    const publicRepoRow = within(table).getByRole('row', { name: /unlimited public repositories/i });
    for (const cell of within(publicRepoRow).getAllByRole('cell')) {
      expect(within(cell).getByText('Included', { selector: '.sr-only' })).toBeDefined();
    }
  });

  /**
   * Structural regression coverage for two table-header bugs — see
   * `pricing-page.tsx`'s `ProHeaderCell` comment for the full story. This is
   * a jsdom/RTL test, not a Playwright one: `packages/website` has no
   * Playwright harness (it is a plain Vite + vitest/jsdom package, unlike
   * `packages/app`), so a real-browser check (does the header actually
   * *look* pinned while scrolling, computed from real layout) was run by
   * hand against `vite preview` with a throwaway Playwright script and is
   * described in the PR body, not checked in. What jsdom *can* assert is
   * the DOM/class shape that caused each bug, so a regression here fails a
   * test even though the visual symptom needs a real browser to see:
   *   - all four header `<th>`s are one row, and every one of them (not a
   *     shared `<thead>`/`<tr>`) individually carries `sticky`;
   *   - the class that broke the Pro header's `position` (a same-layer
   *     `position: relative` that raced `.sticky`'s `position: sticky` and
   *     won by source order) is gone;
   *   - the table's ancestor chain, up to `<main>`, carries no `overflow`
   *     utility other than `visible` — any of `hidden`/`auto`/`clip`/`scroll`
   *     turns that ancestor into `position: sticky`'s containing block
   *     instead of the real, page-scrolling viewport.
   */
  it('keeps every tier header in one sticky row, with no overflow ancestor to break it', () => {
    render(<PricingPage />);
    const table = screen.getByTestId('pricing-table');
    const headerRow = within(table).getAllByRole('row')[0]!;
    const headers = within(headerRow).getAllByRole('columnheader');

    expect(headers).toHaveLength(4);
    for (const th of headers) {
      expect(th.parentElement).toBe(headerRow);
      expect(th.className).toContain('sticky');
      expect(th.className).toContain('top-16');
      // The class that used to fight `.sticky` for `position` on the Pro
      // header only — must never come back.
      expect(th.className).not.toContain('ws-pricing-pro-header');
    }

    const overflowUtilityRe = /(^|\s)overflow(-[xy])?-(hidden|auto|clip|scroll)(\s|$)/;
    let node: HTMLElement | null = table;
    while (node && node.tagName !== 'MAIN') {
      expect(node.className).not.toMatch(overflowUtilityRe);
      node = node.parentElement;
    }
    expect(node?.tagName).toBe('MAIN');
  });

  it('groups the comparison table by category, mirroring the app rail', () => {
    render(<PricingPage />);
    const table = screen.getByTestId('pricing-table');
    expect(within(table).getByText('Plan basics')).toBeDefined();
    expect(within(table).getByText('Workspace')).toBeDefined();
    expect(within(table).getByText('Git & Forge')).toBeDefined();
    expect(within(table).getByText('Agents')).toBeDefined();
    expect(within(table).getByText('Limits')).toBeDefined();

    // Every Workspace and Git & Forge item is free on every tier.
    for (const label of [/^dashboard/i, /^explorer/i, /^issues/i, /^graph/i]) {
      const row = within(table).getByRole('row', { name: label });
      for (const cell of within(row).getAllByRole('cell')) {
        expect(within(cell).getByText('Included', { selector: '.sr-only' })).toBeDefined();
      }
    }
  });

  it('splits the Agents group: paid features gated, local models free everywhere', () => {
    render(<PricingPage />);
    const table = screen.getByTestId('pricing-table');

    // Workflows: unchecked for Starter, checked for Pro and Max.
    const workflowsRow = within(table).getByRole('row', { name: /^workflows/i });
    const workflowsCells = within(workflowsRow).getAllByRole('cell');
    expect(within(workflowsCells[0]!).queryByText('Included')).toBeNull();
    expect(within(workflowsCells[1]!).getByText('Included', { selector: '.sr-only' })).toBeDefined();
    expect(within(workflowsCells[2]!).getByText('Included', { selector: '.sr-only' })).toBeDefined();

    // Same split for Councils and the Video Editor.
    for (const name of [/^councils/i, /^video editor/i]) {
      const row = within(table).getByRole('row', { name });
      const rowCells = within(row).getAllByRole('cell');
      expect(within(rowCells[0]!).queryByText('Included')).toBeNull();
      expect(within(rowCells[1]!).getByText('Included', { selector: '.sr-only' })).toBeDefined();
      expect(within(rowCells[2]!).getByText('Included', { selector: '.sr-only' })).toBeDefined();
    }

    // Local models (Ollama): checked for all three tiers.
    const localModelsRow = within(table).getByRole('row', { name: /local models/i });
    for (const cell of within(localModelsRow).getAllByRole('cell')) {
      expect(within(cell).getByText('Included', { selector: '.sr-only' })).toBeDefined();
    }
  });

  it('shows the live-agent session limits per tier, with terminals unlimited everywhere', () => {
    render(<PricingPage />);
    const table = screen.getByTestId('pricing-table');

    const sessionsRow = within(table).getByRole('row', { name: /live agent sessions/i });
    const sessionCells = within(sessionsRow).getAllByRole('cell');
    expect(sessionCells[0]!.textContent).toContain(String(STARTER_SESSION_LIMIT));
    expect(sessionCells[1]!.textContent).toContain(String(PRO_SESSION_LIMIT));
    expect(sessionCells[2]!.textContent).toMatch(/unlimited/i);

    const terminalsRow = within(table).getByRole('row', { name: /^terminals/i });
    for (const cell of within(terminalsRow).getAllByRole('cell')) {
      expect(cell.textContent).toMatch(/unlimited/i);
    }
  });

  it('foots the table with a RAM-bounded concurrency note', () => {
    render(<PricingPage />);
    expect(screen.getByText(/bounded by its RAM/i)).toBeDefined();
  });

  it('renders a pricing-specific FAQ section after the comparison table', () => {
    render(<PricingPage />);
    const table = screen.getByTestId('pricing-table');
    const faq = document.getElementById('pricing-faq');
    expect(faq).not.toBeNull();
    const position = table.compareDocumentPosition(faq!);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(within(faq as HTMLElement).getAllByText(/per seat/i).length).toBeGreaterThan(0);
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
