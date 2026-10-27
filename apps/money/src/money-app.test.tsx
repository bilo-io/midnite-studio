// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { financeManifest, useFinanceStore } from '@midnite/studio-feature-finance/renderer';
import { FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { MoneyApp } from './money-app';
import { MONEY_APP } from './money-manifest';
import { GRANT_HINT } from './views/money-home';

const ok = <T,>(value: T) => async () => ({ ok: true as const, value });

function stubBridge(hasKey: boolean) {
  const has = vi.fn(async () => ({ hasKey }));
  const get = vi.fn();
  window.midniteStudio = {
    secrets: { has, get },
    report,
    finance: { search: ok([]), quote: ok({ price: 1, currency: 'USD' }), history: ok([]) },
    markets: {
      series: ok({ series: {} }),
      quotes: ok({ quotes: {} }),
      search: ok([]),
      rates: ok({ base: 'USD', rates: { USD: 1 }, fetchedAt: 1, stale: false }),
      portfolio: ok({ version: 1, balances: {}, holdings: [], transactions: [], watchlist: [], extraAssets: [] }),
      apply: ok({}),
      news: ok({ items: [], stale: false, failed: [] }),
    },
  } as unknown as typeof window.midniteStudio;
  return { has, get };
}

let onReportOpen: (() => void) | null = null;
const report = {
  onOpen: vi.fn((handler: () => void) => {
    onReportOpen = handler;
    return () => undefined;
  }),
  bundle: vi.fn(async () => ({ text: '' })),
  ghStatus: vi.fn(async () => ({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' })),
};

beforeEach(() => {
  // The store is module-level; every test starts un-hydrated, as a fresh window would.
  useFinanceStore.setState({ secretsHydrated: false, twelveDataKeyConfigured: false });
  stubBridge(false);
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Money composition', () => {
  it('is the owner the placement map names for the finance feature', () => {
    expect(placementOwners(FEATURE_PLACEMENT.finance)[0]).toBe(MONEY_APP.id);
    expect(MONEY_APP.features).toEqual([financeManifest.feature]);
  });

  it("wears the launcher catalog's accent", () => {
    expect(MONEY_APP.accent).toBe('#84cc16');
  });
});

describe('Money home', () => {
  it('shows its own board — chart, watchlist, markets, allocation, news — framed as Money', async () => {
    render(<MoneyApp />);
    expect(screen.getByText('Midnite Money')).toBeDefined();
    for (const label of ['Chart', 'Cards', 'Watchlist', 'Markets', 'Allocation', 'News', 'Transactions']) {
      expect(screen.getByRole('region', { name: label })).toBeDefined();
    }
  });

  it('tells the user to grant Money the market-data key when main reports none, without reading one', async () => {
    const { has, get } = stubBridge(false);
    render(<MoneyApp />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(GRANT_HINT));
    expect(GRANT_HINT).toContain('grant Money access to the market-data key in Vault');
    expect(has).toHaveBeenCalledWith({ key: 'finance.twelveData' });
    expect(get).not.toHaveBeenCalled();
  });

  it('shows no grant hint once the key is readable', async () => {
    const { has } = stubBridge(true);
    render(<MoneyApp />);
    await waitFor(() => expect(has).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});

describe('Money Report an Issue', () => {
  it('mounts the dialog for midnite-money: the Help menu event opens it', async () => {
    render(<MoneyApp />);
    await waitFor(() => expect(onReportOpen).not.toBeNull());
    expect(screen.queryByText('Report an issue')).toBeNull();
    act(() => onReportOpen?.());
    expect(await screen.findByText('Report an issue')).toBeDefined();
  });
});
