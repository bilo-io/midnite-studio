import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinancePanel } from './finance-panel';
import { useFinanceStore } from './finance-store';

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FinancePanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useFinanceStore.setState({ assets: [], twelveDataKeyConfigured: false, secretsHydrated: true });
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
    Object.assign(window, {
      midniteStudio: {
        secrets: {
          get: vi.fn(async () => ({ value: null })),
          set: vi.fn(async () => {}),
        },
        finance: {
          search: vi.fn(async () => ({
            ok: true as const,
            value: [{ kind: 'crypto' as const, symbol: 'bitcoin', name: 'Bitcoin (BTC)' }],
          })),
          quote: vi.fn(async () => ({ ok: true as const, value: { price: 50000, currency: 'USD' } })),
          history: vi.fn(async () => ({
            ok: true as const,
            value: [
              { t: 1000, c: 100 },
              { t: 2000, c: 110 },
            ],
          })),
        },
      },
    });

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

  it('blocks stock search until an API key is entered', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Stocks' }));
    expect(screen.queryByPlaceholderText('Search stocks…')).toBeNull();
    expect(screen.getByPlaceholderText('Paste your Twelve Data API key')).not.toBeNull();

    const keyInput = screen.getByPlaceholderText('Paste your Twelve Data API key');
    fireEvent.change(keyInput, { target: { value: 'key123' } });
    fireEvent.blur(keyInput);
    await waitFor(() => expect(screen.getByPlaceholderText('Search stocks…')).not.toBeNull());
  });
});
