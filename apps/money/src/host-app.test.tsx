// vitest/jsdom: the host's rail and view router over a mock bridge — nothing here needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryLedger } from '@midnite/studio-feature-ledger/renderer';
import { firstViewOfModule, moduleOfView, navConfigProblems, suiteShellTestBridge } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { MoneyHostApp, MONEY_PANES } from './host-app';
import { MONEY_HOST_NAV } from './host-nav';

const ok = <T,>(value: T) => async () => ({ ok: true as const, value });

beforeEach(() => {
  window.midniteStudio = suiteShellTestBridge({
    secrets: { has: vi.fn(async () => ({ hasKey: false })), get: vi.fn() },
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
    ledger: createMemoryLedger({ seed: false }),
    report: {
      onOpen: vi.fn(() => () => undefined),
      bundle: vi.fn(async () => ({ text: '' })),
      ghStatus: vi.fn(async () => ({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' })),
    },
  }) as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Money host nav', () => {
  it('has one group per module in APP_MODULES.money, in order, and a sound config', () => {
    expect(MONEY_HOST_NAV.groups?.map((g) => g.id)).toEqual([...APP_MODULES.money]);
    expect(navConfigProblems(MONEY_HOST_NAV)).toEqual([]);
  });

  it('has a pane for every group, and routes every view to its group', () => {
    for (const group of MONEY_HOST_NAV.groups ?? []) {
      expect(MONEY_PANES[group.id]).toBeTypeOf('function');
      for (const view of group.views) expect(moduleOfView(MONEY_HOST_NAV, view.id)).toBe(group.id);
    }
  });

  it("lands a module link on that module's first view", () => {
    expect(firstViewOfModule(MONEY_HOST_NAV, 'money')).toBe('markets');
    expect(firstViewOfModule(MONEY_HOST_NAV, 'accountant')).toBe('accountant.overview');
  });
});

describe('Money host', () => {
  it('shows a Money and an Accountant group, and routes Overview to the empty state', async () => {
    render(<MoneyHostApp />);
    const rail = screen.getByRole('navigation', { name: 'Views' });
    for (const label of ['Markets', 'Overview', 'Journal']) expect(within(rail).getByRole('link', { name: label })).toBeDefined();
    fireEvent.click(within(rail).getByRole('link', { name: 'Overview' }));
    await waitFor(() => expect(screen.getByText('No books yet')).toBeDefined());
  });
});
