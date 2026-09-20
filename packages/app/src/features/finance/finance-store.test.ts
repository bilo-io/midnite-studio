import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FINANCE_PERSIST_KEY,
  migrateFinanceKeyFromLocalStorage,
  useFinanceStore,
} from './finance-store';

const reset = () =>
  useFinanceStore.setState({
    assets: [],
    twelveDataKeyConfigured: false,
    secretsHydrated: false,
  });

beforeEach(() => {
  reset();
  localStorage.clear();
});

describe('migrateFinanceKeyFromLocalStorage', () => {
  it('moves a legacy plaintext key into main and blanks localStorage', async () => {
    localStorage.setItem(
      FINANCE_PERSIST_KEY,
      JSON.stringify({ state: { assets: [], twelveDataApiKey: 'legacy-secret-key' }, version: 1 }),
    );
    const set = vi.fn(async () => {});
    await migrateFinanceKeyFromLocalStorage(
      { secrets: { set, get: async () => ({ value: null }) } } as never,
      localStorage,
    );
    expect(set).toHaveBeenCalledWith({ key: 'finance.twelveData', value: 'legacy-secret-key' });
    const stored = JSON.parse(localStorage.getItem(FINANCE_PERSIST_KEY)!);
    expect(stored.state.twelveDataApiKey).toBe('');
    expect(JSON.stringify(stored)).not.toContain('legacy-secret-key');
  });
});

describe('setApiKey', () => {
  it('persists through the secrets bridge, not zustand', async () => {
    const set = vi.fn(async () => {});
    vi.stubGlobal('window', {
      midniteStudio: { secrets: { set, get: async () => ({ value: 'secret' }) }, finance: {} },
    });
    await useFinanceStore.getState().setApiKey('secret');
    expect(set).toHaveBeenCalledWith({ key: 'finance.twelveData', value: 'secret' });
    expect(useFinanceStore.getState().twelveDataKeyConfigured).toBe(true);
    vi.unstubAllGlobals();
  });
});
