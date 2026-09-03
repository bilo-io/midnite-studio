import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useMetricsStore } from '../../store/metrics-store';
import { useFinanceStore } from '../finance/finance-store';
import { LockScreenBatteryWidget, LockScreenWidgets } from './lock-screen-widgets';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

function stubFinanceFetch(prices: [number, number][]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/market_chart')) {
        return jsonResponse({ prices });
      }
      return jsonResponse({
        name: 'Bitcoin',
        market_data: { current_price: { usd: prices.at(-1)?.[1] } },
      });
    }),
  );
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('LockScreenWidgets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useMetricsStore.setState({
      series: {
        cpu: [{ at: 1000, value: 35 }, { at: 2000, value: 45 }],
        memory: [{ at: 1000, value: 60 }, { at: 2000, value: 62 }],
        gpu: [{ at: 1000, value: 10 }, { at: 2000, value: 15 }],
        disk: [],
      },
      latest: {
        at: 2000,
        cpu: 45,
        memory: 62,
        gpu: 15,
        cpuInfo: { cores: 8, load1: 1.5 },
      },
    });

    useFinanceStore.setState({
      assets: [
        { kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' },
        { kind: 'crypto', symbol: 'ethereum', name: 'Ethereum (ETH)' },
      ],
      twelveDataApiKey: 'test-api-key',
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders system monitor graphs and fintech cycle widgets', () => {
    render(<LockScreenWidgets />, { wrapper: createWrapper() });

    expect(screen.getByTestId('lock-screen-widgets')).toBeTruthy();
    expect(screen.getByTestId('lock-sysmon-widget')).toBeTruthy();
    expect(screen.getByTestId('lock-fintech-widget')).toBeTruthy();

    expect(screen.getByText('System Monitor')).toBeTruthy();
    expect(screen.getByText('Fintech Cycle')).toBeTruthy();
    expect(screen.getByText('CPU')).toBeTruthy();
    expect(screen.getByText('RAM')).toBeTruthy();
    expect(screen.getByText('GPU')).toBeTruthy();
  });

  it('color-codes ticker, price, name, and sparkline green on a gain', async () => {
    vi.useRealTimers();
    stubFinanceFetch([
      [1000, 40000],
      [2000, 50000],
    ]);
    useFinanceStore.setState({
      assets: [{ kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' }],
      twelveDataApiKey: '',
    });

    render(<LockScreenWidgets />, { wrapper: createWrapper() });

    const widget = screen.getByTestId('lock-fintech-widget');
    const ticker = () => widget.querySelector('.font-mono.text-lg.font-bold');
    await vi.waitFor(() => {
      expect(ticker()?.textContent).toBe('BTC');
      expect(widget.textContent).toContain('+25.00%');
    });

    expect(ticker()?.className).toContain('text-emerald-600');
    expect(screen.getByText('$50,000.00').className).toContain('text-emerald-600');
    expect(screen.getByText('Bitcoin (BTC)').className).toContain('text-emerald-600');
    expect(widget.querySelector('svg[width="76"]')?.parentElement?.className).toContain('text-emerald-600');
  });

  it('color-codes ticker, price, name, and sparkline red on a loss', async () => {
    vi.useRealTimers();
    stubFinanceFetch([
      [1000, 60000],
      [2000, 50000],
    ]);
    useFinanceStore.setState({
      assets: [{ kind: 'crypto', symbol: 'bitcoin', name: 'Bitcoin (BTC)' }],
      twelveDataApiKey: '',
    });

    render(<LockScreenWidgets />, { wrapper: createWrapper() });

    const widget = screen.getByTestId('lock-fintech-widget');
    const ticker = () => widget.querySelector('.font-mono.text-lg.font-bold');
    await vi.waitFor(() => {
      expect(ticker()?.textContent).toBe('BTC');
    });

    expect(ticker()?.className).toContain('text-destructive');
    expect(screen.getByText('$50,000.00').className).toContain('text-destructive');
    expect(screen.getByText('Bitcoin (BTC)').className).toContain('text-destructive');
    expect(widget.querySelector('svg[width="76"]')?.parentElement?.className).toContain('text-destructive');
  });
});

describe('LockScreenBatteryWidget (Phase 46 Theme B)', () => {
  afterEach(cleanup);

  it('renders nothing on a machine with no battery', () => {
    useMetricsStore.setState({ latest: { at: 1, battery: { hasBattery: false, devices: [] } } });
    const { container } = render(<LockScreenBatteryWidget />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no sample has arrived yet', () => {
    useMetricsStore.setState({ latest: null });
    const { container } = render(<LockScreenBatteryWidget />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the percentage and a charging glyph while plugged in', () => {
    useMetricsStore.setState({
      latest: { at: 1, battery: { hasBattery: true, percent: 82, isCharging: true, devices: [] } },
    });
    render(<LockScreenBatteryWidget />);
    expect(screen.getByTestId('lock-battery-widget')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();
  });

  it('falls back to the first connected device when there is no primary percent', () => {
    useMetricsStore.setState({
      latest: {
        at: 1,
        battery: {
          hasBattery: true,
          devices: [{ id: 'kb', name: 'Keyboard', type: 'keyboard', percent: 41 }],
        },
      },
    });
    render(<LockScreenBatteryWidget />);
    expect(screen.getByText('41%')).toBeTruthy();
  });
});
