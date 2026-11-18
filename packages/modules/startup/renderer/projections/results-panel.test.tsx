// vitest/jsdom with Recharts' ResponsiveContainer replaced by a fixed 800x320 box (jsdom has no layout).
import { cleanup, screen } from '@testing-library/react';
import { Children, cloneElement, isValidElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FLEET_GLOBALS, seedFleetCatalog } from '@midnite/studio-shared';

import { computeFleetProjection } from './fleet-model';
import { formatMoney } from './format-money';
import { MoneyProvider } from './money-context';
import { ResultsPanel } from './results-panel';
import { fleetNode, fleetProjection } from './test-fixtures';
import { renderWithChrome } from './test-harness';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) => (
      <div style={{ width: 800, height: 320 }}>{Children.map(children, (c) => (isValidElement(c) ? cloneElement(c as ReactElement<{ width: number; height: number }>, { width: 800, height: 320 }) : c))}</div>
    ),
  };
});

afterEach(cleanup);

describe('ResultsPanel', () => {
  // The Phase 150 B fixture: dual-4090, pro tier, qty 1, 70 %, R 25/h, R 3.20/kWh, horizon 12.
  const fixture = fleetProjection({ globals: { ...DEFAULT_FLEET_GLOBALS, horizonMonths: 12 }, nodes: [fleetNode(1)] });
  const result = computeFleetProjection(fixture, seedFleetCatalog('USD'));
  const show = () => renderWithChrome(<ResultsPanel draft={fixture} result={result} update={() => undefined} pending={false} problem={null} readOnly={false} />);

  it('KPI tiles show formatMoney values, and payback copy for no payback', () => {
    show();
    expect(screen.getByRole('group', { name: 'CapEx' }).textContent).toContain(formatMoney(result.capexMinor, 'USD'));
    expect(screen.getByRole('group', { name: 'Net margin /mo' }).textContent).toContain(formatMoney(result.netMarginMonthlyMinor, 'USD'));
    expect(screen.getByRole('group', { name: 'Payback' }).textContent).toContain('Not within 12 mo');
    expect(result.series).toHaveLength(12);
  });

  it('prints the company currency from the provider', () => {
    const gbp = seedFleetCatalog('GBP');
    renderWithChrome(
      <MoneyProvider currency="GBP" catalog={gbp}>
        <ResultsPanel draft={fixture} result={computeFleetProjection(fixture, gbp)} update={() => undefined} pending={false} problem={null} readOnly={false} />
      </MoneyProvider>,
    );
    expect(screen.getByRole('group', { name: 'CapEx' }).textContent).toContain('£');
    expect(screen.getByRole('group', { name: 'CapEx' }).textContent).not.toContain('$');
  });

  it('Net margin is the largest text (text-3xl)', () => {
    show();
    expect(screen.getByRole('group', { name: 'Net margin /mo' }).querySelector('.text-3xl')).not.toBeNull();
    expect(screen.getByRole('group', { name: 'CapEx' }).querySelector('.text-3xl')).toBeNull();
  });

  it('renders the lazy chart under its labelled wrapper', async () => {
    show();
    expect(await screen.findByRole('img', { name: 'Monthly costs, revenue and cumulative cash over 12 months' })).toBeTruthy();
  });
});
