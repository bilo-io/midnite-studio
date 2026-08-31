import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useMetricsStore } from '../../store/metrics-store';
import { useFinanceStore } from '../finance/finance-store';
import { LockScreenWidgets } from './lock-screen-widgets';

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
});
