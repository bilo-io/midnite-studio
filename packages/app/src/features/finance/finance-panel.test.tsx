import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinancePanel } from './finance-panel';
import { useFinanceStore } from './finance-store';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FinancePanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useFinanceStore.setState({ assets: [], twelveDataApiKey: '' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FinancePanel', () => {
  it('opens straight into the editor when the watchlist is empty', () => {
    renderPanel();
    expect(screen.getByPlaceholderText('Search coins…')).not.toBeNull();
  });

  it('adds a searched coin to the watchlist and then renders its row', async () => {
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
              [1000, 100],
              [2000, 110],
            ],
          });
        }
        // /coins/:id quote lookup
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

    renderPanel();

    fireEvent.change(screen.getByPlaceholderText('Search coins…'), { target: { value: 'bit' } });
    await waitFor(() => expect(screen.getByText('Bitcoin (BTC)')).not.toBeNull(), {
      timeout: 2000,
    });

    fireEvent.click(screen.getByRole('button', { name: /Bitcoin \(BTC\)/ }));

    expect(useFinanceStore.getState().assets).toEqual([
      { kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));

    await waitFor(() => expect(screen.getByText('$50,000.00')).not.toBeNull());
    expect(screen.getByText('+10.00%')).not.toBeNull();
  });

  it('blocks stock search until an API key is entered', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Stocks' }));
    expect(screen.queryByPlaceholderText('Search stocks…')).toBeNull();
    expect(screen.getByPlaceholderText('Paste your Twelve Data API key')).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Paste your Twelve Data API key'), {
      target: { value: 'key123' },
    });
    expect(screen.getByPlaceholderText('Search stocks…')).not.toBeNull();
  });
});
