import { beforeEach, describe, expect, it } from 'vitest';

import { FINANCE_WATCHLIST_MAX, useFinanceStore } from './finance-store';

const reset = () => useFinanceStore.setState({ assets: [], twelveDataApiKey: '' });
beforeEach(reset);

const btc = { kind: 'crypto' as const, symbol: 'bitcoin', name: 'Bitcoin (BTC)' };
const eth = { kind: 'crypto' as const, symbol: 'ethereum', name: 'Ethereum (ETH)' };

describe('addAsset', () => {
  it('appends a new asset', () => {
    useFinanceStore.getState().addAsset(btc);
    expect(useFinanceStore.getState().assets).toEqual([btc]);
  });

  it('ignores a duplicate kind+symbol', () => {
    useFinanceStore.getState().addAsset(btc);
    useFinanceStore.getState().addAsset({ ...btc, name: 'different name, same coin' });
    expect(useFinanceStore.getState().assets).toHaveLength(1);
  });

  it('refuses past the watchlist cap', () => {
    for (let i = 0; i < FINANCE_WATCHLIST_MAX; i += 1) {
      useFinanceStore.getState().addAsset({ kind: 'crypto', symbol: `coin-${i}`, name: `Coin ${i}` });
    }
    useFinanceStore.getState().addAsset(eth);
    expect(useFinanceStore.getState().assets).toHaveLength(FINANCE_WATCHLIST_MAX);
  });
});

describe('removeAsset', () => {
  it('drops only the matching kind+symbol', () => {
    useFinanceStore.getState().addAsset(btc);
    useFinanceStore.getState().addAsset(eth);
    useFinanceStore.getState().removeAsset('crypto:bitcoin');
    expect(useFinanceStore.getState().assets).toEqual([eth]);
  });
});

describe('setApiKey', () => {
  it('stores the Twelve Data key', () => {
    useFinanceStore.getState().setApiKey('secret');
    expect(useFinanceStore.getState().twelveDataApiKey).toBe('secret');
  });
});
