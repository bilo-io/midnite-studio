import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderView } from '../../../test-support/render';
import { FinanceSegment } from './finance-segment';
import { useFinanceStore } from './finance-store';

/**
 * Migrated from `e2e/finance-widget.spec.ts` (Phase 82 Theme C wave 5) — the
 * footer trigger actually opening `FinancePanel` on click, and a coin added
 * through the panel's own search flow reflecting back onto both the panel
 * row and the footer trigger (ticker, price, percentage, sparkline). 2 of
 * the original 2 tests moved here — no straggler needed a real browser.
 *
 * `finance-segment.test.tsx`/`finance-panel.test.tsx` already cover most of
 * the derivation logic (typewriter, red/green highlight, cycling, the search
 * → add → row round trip) by seeding `useFinanceStore` directly or mounting
 * `FinancePanel` alone; what neither reaches is `FinanceSegment`'s own
 * `Popover` actually opening on a real click, and the SAME state landing on
 * both the trigger and the panel it opens — the "assembled" gap this file
 * closes, same class of gap `pr-detail-link-routing.bridge.test.tsx` closes
 * for its own feature.
 *
 * This surface calls a real external API (CoinGecko) directly from the
 * renderer rather than through `window.midniteStudio` — `fetch` is stubbed
 * per test, the same device `finance-panel.test.tsx` already uses, rather
 * than `installMockBridgeJsdom`, which has nothing to do with it.
 */

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

function mockCoinGecko(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/search')) {
        return jsonResponse({ coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }] });
      }
      if (url.includes('/market_chart')) {
        return jsonResponse({
          prices: [
            [1_700_000_000_000, 45000],
            [1_700_300_000_000, 47000],
            [1_700_600_000_000, 50000],
          ],
        });
      }
      return jsonResponse({
        name: 'Bitcoin',
        market_data: {
          current_price: { usd: 50000 },
          high_24h: { usd: 51000 },
          low_24h: { usd: 49000 },
          price_change_24h: 500,
          price_change_percentage_24h: 1.01,
        },
      });
    }),
  );
}

beforeEach(() => {
  useFinanceStore.setState({ assets: [], twelveDataApiKey: '' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the finance footer, assembled through a real render', () => {
  it('shows a neutral trigger with an empty watchlist, opens the editor on click', () => {
    renderView(<FinanceSegment />);

    const trigger = screen.getByTestId('finance-segment');
    expect(trigger.textContent).toContain('Finance');

    fireEvent.click(trigger);
    const panel = screen.getByTestId('finance-segment-panel');
    expect(panel).toBeTruthy();
    expect(within(panel).getByPlaceholderText('Search coins…')).toBeTruthy();
  });

  it('adding a coin renders it with a 7-day sparkline, USD price, and a colored up arrow', async () => {
    mockCoinGecko();
    renderView(<FinanceSegment />);

    fireEvent.click(screen.getByTestId('finance-segment'));
    const panel = screen.getByTestId('finance-segment-panel');

    fireEvent.change(within(panel).getByPlaceholderText('Search coins…'), {
      target: { value: 'bit' },
    });
    const coinButton = await within(panel).findByRole('button', { name: /Bitcoin \(BTC\)/ });
    fireEvent.click(coinButton);

    fireEvent.click(within(panel).getByRole('button', { name: 'Done editing' }));

    await waitFor(() => expect(within(panel).getByText('$50,000.00')).toBeTruthy());
    expect(within(panel).getByText('+11.11%')).toBeTruthy();
    expect(panel.querySelectorAll('li svg[preserveAspectRatio="none"] path')).toHaveLength(2);

    // The footer trigger itself picks up the headline ticker, price, percentage, and sparkline too.
    const trigger = screen.getByTestId('finance-segment');
    await waitFor(() => {
      expect(trigger.textContent).toContain('BTC');
      expect(trigger.textContent).toContain('$50,000.00');
      expect(trigger.textContent).toContain('+11.11%');
    });
    expect(trigger.querySelectorAll('svg[preserveAspectRatio="none"] path')).toHaveLength(2);
  });
});
