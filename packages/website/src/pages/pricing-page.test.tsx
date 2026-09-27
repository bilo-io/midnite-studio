import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Footer } from '../sections/footer/footer';
import { SECTIONS } from '../sections/registry';

import {
  MAX_MONTHLY_USD,
  MAX_YEARLY_STRUCK_USD,
  MAX_YEARLY_USD,
  PRO_MONTHLY_USD,
  PRO_YEARLY_STRUCK_USD,
  PRO_YEARLY_USD,
  PRO_SESSION_LIMIT,
  PricingPage,
  STARTER_SESSION_LIMIT,
  YEARLY_DISCOUNT_LABEL,
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
    expect(screen.getByText(`$${PRO_YEARLY_USD}`)).toBeDefined();
    expect(screen.getByText(`$${MAX_YEARLY_USD}`)).toBeDefined();
  });

  it('shows Starter as Free in both billing modes', () => {
    render(<PricingPage />);
    const columns = screen.getByTestId('pricing-columns');
    expect(within(columns).getByText('Free')).toBeDefined();

    fireEvent.click(screen.getByRole('switch', { name: /toggle monthly or yearly billing/i }));
    expect(within(columns).getByText('Free')).toBeDefined();
  });

  it('shows the yearly prices and struck-through monthly-equivalent figures by default', () => {
    render(<PricingPage />);
    expect(screen.getByText(`$${PRO_YEARLY_USD}`)).toBeDefined();
    expect(screen.getByText(`$${PRO_YEARLY_STRUCK_USD}`)).toBeDefined();
    expect(screen.getByText(`$${MAX_YEARLY_USD}`)).toBeDefined();
    expect(screen.getByText(`$${MAX_YEARLY_STRUCK_USD}`)).toBeDefined();
  });

  it('toggling to monthly updates every price and hides the struck-through figures and badges', () => {
    render(<PricingPage />);
    const toggle = screen.getByRole('switch', { name: /toggle monthly or yearly billing/i });

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(`$${PRO_MONTHLY_USD}`)).toBeDefined();
    expect(screen.getByText(`$${MAX_MONTHLY_USD}`)).toBeDefined();
    expect(screen.queryByText(`$${PRO_YEARLY_STRUCK_USD}`)).toBeNull();
    expect(screen.queryByText(`$${MAX_YEARLY_STRUCK_USD}`)).toBeNull();
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
