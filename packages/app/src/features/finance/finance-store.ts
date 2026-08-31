import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assetKey, type FinanceAsset } from './finance-types';

/** Mirrors the source app's `MARKET_WATCHLIST_MAX` — keeps the poll fan-out bounded. */
export const FINANCE_WATCHLIST_MAX = 10;

export type FinanceState = {
  assets: FinanceAsset[];
  /**
   * Twelve Data key for stock quotes. Crypto works with none.
   *
   * Stored in plaintext in this store's own `localStorage` entry, unlike
   * every other credential this app handles (`gh` tokens, forge auth), which
   * never touch renderer-side storage unencrypted. That asymmetry is the
   * direct consequence of fetching straight from the renderer rather than
   * proxying through Electron main — `safeStorage` lives in main, and going
   * through it would mean the IPC channel this design deliberately skipped.
   */
  twelveDataApiKey: string;

  addAsset: (asset: FinanceAsset) => void;
  removeAsset: (key: string) => void;
  setApiKey: (key: string) => void;
};

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      assets: [],
      twelveDataApiKey: '',

      addAsset: (asset) => {
        const { assets } = get();
        if (assets.length >= FINANCE_WATCHLIST_MAX) return;
        if (assets.some((a) => assetKey(a) === assetKey(asset))) return;
        set({ assets: [...assets, asset] });
      },
      removeAsset: (key) => set((s) => ({ assets: s.assets.filter((a) => assetKey(a) !== key) })),
      setApiKey: (twelveDataApiKey) => set({ twelveDataApiKey }),
    }),
    { name: 'midnite.finance', version: 1 },
  ),
);
