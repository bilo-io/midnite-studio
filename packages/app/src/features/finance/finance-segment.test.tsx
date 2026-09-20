import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinanceSegment } from './finance-segment';
import { useFinanceStore } from './finance-store';

function stubFinance(options?: {
  quote?: { price: number; currency: string };
  history?: { t: number; c: number }[];
  quoteBySymbol?: Record<string, { price: number; currency: string }>;
  historyBySymbol?: Record<string, { t: number; c: number }[]>;
}): void {
  vi.stubGlobal('window', {
    midniteStudio: {
      secrets: {
        get: vi.fn(async () => ({ value: null })),
        set: vi.fn(async () => {}),
      },
      finance: {
        search: vi.fn(async () => ({ ok: true as const, value: [] })),
        quote: vi.fn(async (req: { symbol: string }) => ({
          ok: true as const,
          value:
            options?.quoteBySymbol?.[req.symbol] ??
            options?.quote ??
            { price: 50000, currency: 'USD' },
        })),
        history: vi.fn(async (req: { symbol: string }) => ({
          ok: true as const,
          value:
            options?.historyBySymbol?.[req.symbol] ??
            options?.history ??
            [
              { t: 1000, c: 40000 },
              { t: 2000, c: 50000 },
            ],
        })),
      },
    },
  });
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
  useFinanceStore.setState({ assets: [], twelveDataKeyConfigured: false, secretsHydrated: true });
  stubFinance();
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

    expect(trigger.querySelector('svg path')).not.toBeNull();
    expect(trigger.className).toContain('status-graphs-on-hover');
    expect(trigger.querySelector('[data-status-bar-graph]')).not.toBeNull();
    expect(trigger.firstElementChild?.className).toContain('text-emerald-600');
  });

  it('renders red highlight when price has decreased', async () => {
    stubFinance({
      history: [
        { t: 1000, c: 60000 },
        { t: 2000, c: 50000 },
      ],
    });

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
    stubFinance({
      quoteBySymbol: {
        bitcoin: { price: 50000, currency: 'USD' },
        ethereum: { price: 3000, currency: 'USD' },
      },
      historyBySymbol: {
        bitcoin: [
          { t: 1, c: 45000 },
          { t: 2, c: 50000 },
        ],
        ethereum: [
          { t: 1, c: 2800 },
          { t: 2, c: 3000 },
        ],
      },
    });

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

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    await vi.waitFor(() => {
      expect(trigger.textContent).toContain('ETH');
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    await vi.waitFor(() => {
      expect(trigger.textContent).toContain('BTC');
    });
  });

  it('types out ticker, price, and percentage via typewriter effect', async () => {
    useFinanceStore.setState({
      assets: [{ kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' }],
    });

    vi.useFakeTimers();
    renderSegment();

    const trigger = screen.getByTestId('finance-segment');

    await vi.waitFor(() => {
      expect(trigger.textContent).toBeDefined();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await vi.waitFor(() => {
      expect(trigger.textContent).toContain('BTC');
      expect(trigger.textContent).toContain('$50,000.00');
      expect(trigger.textContent).toContain('+25.00%');
    });
  });
});
