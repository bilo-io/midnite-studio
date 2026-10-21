// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS } from '@midnite/studio-shared';

import { createMoneyBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return { invoke: vi.fn(async () => 'answer'), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
}

describe('createMoneyBridge', () => {
  it('exposes exactly finance, financeAccounts, markets and secrets.has', () => {
    const bridge = createMoneyBridge(fakeIpc());
    expect(Object.keys(bridge).sort()).toEqual(['finance', 'financeAccounts', 'markets', 'report', 'secrets']);
    expect(Object.keys(bridge.report).sort()).toEqual(['bundle', 'copy', 'error', 'ghStatus', 'logPath', 'onOpen', 'openUrl', 'reveal', 'submitIssue']);
    // Reads, a test, an add and a remove — no order, withdraw or transfer method exists to be called.
    expect(Object.keys(bridge.financeAccounts).sort()).toEqual(['add', 'list', 'remove', 'snapshots', 'test']);
    expect(Object.keys(bridge.finance).sort()).toEqual(['history', 'quote', 'search']);
    expect(Object.keys(bridge.markets).sort()).toEqual(['apply', 'news', 'portfolio', 'quotes', 'rates', 'search', 'series']);
  });

  it('can never read or write a secret: only `has` is exposed', () => {
    const { secrets } = createMoneyBridge(fakeIpc());
    expect(Object.keys(secrets)).toEqual(['has']);
    expect('get' in secrets).toBe(false);
    expect('set' in secrets).toBe(false);
  });

  it('invokes the matching channels', async () => {
    const ipc = fakeIpc();
    const bridge = createMoneyBridge(ipc);
    await bridge.finance.quote({ kind: 'crypto', symbol: 'bitcoin' });
    await bridge.markets.rates();
    await bridge.secrets.has({ key: 'finance.twelveData' });
    expect(vi.mocked(ipc.invoke).mock.calls.map((c) => c[0])).toEqual([
      CHANNELS.financeQuote,
      CHANNELS.marketsRates,
      CHANNELS.secretsHas,
    ]);
  });
});
