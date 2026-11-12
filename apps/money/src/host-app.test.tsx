// vitest/jsdom: the host's rail and view router over a mock bridge — nothing here needs a real browser.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firstViewOfModule, moduleOfView, navConfigProblems, suiteShellTestBridge } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { MoneyHostApp, MONEY_PANES } from './host-app';
import { MONEY_HOST_NAV } from './host-nav';

beforeEach(() => {
  window.midniteStudio = suiteShellTestBridge({
    markets: {
      series: vi.fn().mockResolvedValue({ ok: true, value: { series: [] } }),
      quotes: vi.fn().mockResolvedValue({ ok: true, value: { quotes: [] } }),
      search: vi.fn().mockResolvedValue({ ok: true, value: { results: [] } }),
      rates: vi.fn().mockResolvedValue({ ok: true, value: { rates: { USD: 1 }, fetchedAt: 0 } }),
      portfolio: vi.fn().mockResolvedValue({ ok: true, value: { portfolio: null } }),
      apply: vi.fn(),
      news: vi.fn().mockResolvedValue({ ok: true, value: { items: [] } }),
    },
    finance: { search: vi.fn(), quote: vi.fn(), history: vi.fn() },
    financeAccounts: { list: vi.fn().mockResolvedValue({ ok: true, value: { accounts: [] } }), test: vi.fn(), add: vi.fn(), remove: vi.fn(), snapshots: vi.fn() },
    secrets: { has: vi.fn().mockResolvedValue({ hasKey: false }) },
    report: {
      logPath: vi.fn().mockResolvedValue({ path: '/tmp/money.log' }),
      bundle: vi.fn().mockResolvedValue({ text: 'boot' }),
      ghStatus: vi.fn().mockResolvedValue({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' }),
      onOpen: () => () => undefined,
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
    expect(screen.getAllByText('Accountant').length).toBeGreaterThan(0);
    fireEvent.click(within(rail).getByRole('link', { name: 'Overview' }));
    await waitFor(() => expect(screen.getByText('No books yet')).toBeDefined());
  });
});
