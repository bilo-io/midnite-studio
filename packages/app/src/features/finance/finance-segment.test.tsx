import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinanceSegment } from './finance-segment';
import { useFinanceStore } from './finance-store';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

function renderSegment() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FinanceSegment />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useFinanceStore.setState({ assets: [], twelveDataApiKey: '' });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FinanceSegment', () => {
  it('renders neutral Finance label when watchlist is empty', () => {
    renderSegment();
    const trigger = screen.getByTestId('finance-segment');
    expect(trigger.textContent).toContain('Finance');
  });

  it('renders ticker, price, sparkline, and green highlight when quote and history are positive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/market_chart')) {
          return jsonResponse({
            prices: [
              [1000, 40000],
              [2000, 50000],
            ],
          });
        }
        return jsonResponse({
          name: 'Bitcoin',
          market_data: { current_price: { usd: 50000 } },
        });
      }),
    );

    useFinanceStore.setState({
      assets: [{ kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' }],
    });

    renderSegment();

    const trigger = screen.getByTestId('finance-segment');
    await vi.waitFor(() => {
      expect(trigger.textContent).toContain('BTC');
      expect(trigger.textContent).toContain('$50,000.00');
      expect(trigger.textContent).toContain('+25.00%');
    });

    // Check sparkline svg path is rendered
    expect(trigger.querySelector('svg path')).not.toBeNull();
    // Check highlight classes
    expect(trigger.firstElementChild?.className).toContain('text-emerald-600');
  });

  it('renders red highlight when price has decreased', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/market_chart')) {
          return jsonResponse({
            prices: [
              [1000, 60000],
              [2000, 50000],
            ],
          });
        }
        return jsonResponse({
          name: 'Bitcoin',
          market_data: { current_price: { usd: 50000 } },
        });
      }),
    );

    useFinanceStore.setState({
      assets: [{ kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' }],
    });

    renderSegment();

    const trigger = screen.getByTestId('finance-segment');
    await vi.waitFor(() => {
      expect(trigger.textContent).toContain('BTC');
    });

    expect(trigger.firstElementChild?.className).toContain('text-destructive');
  });

  it('cycles across tickers every 5 seconds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('bitcoin')) {
          return jsonResponse({
            market_data: { current_price: { usd: 50000 } },
            prices: [
              [1, 45000],
              [2, 50000],
            ],
          });
        }
        return jsonResponse({
          market_data: { current_price: { usd: 3000 } },
          prices: [
            [1, 2800],
            [2, 3000],
          ],
        });
      }),
    );

    useFinanceStore.setState({
      assets: [
        { kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' },
        { kind: 'crypto', symbol: 'ethereum', name: 'Ethereum (ETH)' },
      ],
    });

    vi.useFakeTimers();
    renderSegment();

    const trigger = screen.getByTestId('finance-segment');

    await vi.waitFor(() => {
      expect(trigger.textContent).toContain('BTC');
    });

    // Fast-forward 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    await vi.waitFor(() => {
      expect(trigger.textContent).toContain('ETH');
    });

    // Fast-forward another 5 seconds (cycles back to BTC)
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    await vi.waitFor(() => {
      expect(trigger.textContent).toContain('BTC');
    });
  });
});
