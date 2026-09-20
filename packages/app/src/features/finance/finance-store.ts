import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { bridge } from '../../services/bridge';
import { adoptRenamedPersistKey } from '../../store/persist-rename';
import { assetKey, type FinanceAsset } from './finance-types';

/** Mirrors the source app's `MARKET_WATCHLIST_MAX` — keeps the poll fan-out bounded. */
export const FINANCE_WATCHLIST_MAX = 10;

export const FINANCE_PERSIST_KEY = 'midnite.finance';

export type FinanceState = {
  assets: FinanceAsset[];
  /** Whether main's vault holds a Twelve Data key — never the key itself. */
  twelveDataKeyConfigured: boolean;
  secretsHydrated: boolean;

  hydrateSecrets: () => Promise<void>;
  addAsset: (asset: FinanceAsset) => void;
  removeAsset: (key: string) => void;
  setApiKey: (key: string) => Promise<void>;
};

type LegacyPersisted = {
  state?: { twelveDataApiKey?: string; assets?: FinanceAsset[] };
  twelveDataApiKey?: string;
  assets?: FinanceAsset[];
};

/**
 * One-shot migration: a legacy plaintext key in `localStorage` moves into
 * main's vault, then the persisted field is blanked — through the same
 * pre-hydrate seam as `persist-rename.ts`, not zustand's `migrate`.
 */
export async function migrateFinanceKeyFromLocalStorage(
  api: NonNullable<ReturnType<typeof bridge>>,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): Promise<void> {
  const raw = storage.getItem(FINANCE_PERSIST_KEY);
  if (!raw) return;

  let parsed: LegacyPersisted;
  try {
    parsed = JSON.parse(raw) as LegacyPersisted;
  } catch {
    return;
  }

  const legacyKey =
    parsed.state?.twelveDataApiKey?.trim() ??
    parsed.twelveDataApiKey?.trim() ??
    '';
  if (!legacyKey) return;

  await api.secrets.set({ key: 'finance.twelveData', value: legacyKey });

  const next = { ...parsed };
  if (next.state && typeof next.state === 'object') {
    next.state = { ...next.state, twelveDataApiKey: '' };
  }
  if ('twelveDataApiKey' in next) {
    next.twelveDataApiKey = '';
  }
  storage.setItem(FINANCE_PERSIST_KEY, JSON.stringify(next));
}

adoptRenamedPersistKey('midnite-git.finance', FINANCE_PERSIST_KEY);

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      assets: [],
      twelveDataKeyConfigured: false,
      secretsHydrated: false,

      hydrateSecrets: async () => {
        if (get().secretsHydrated) return;
        const api = bridge();
        if (!api) {
          set({ secretsHydrated: true });
          return;
        }
        await migrateFinanceKeyFromLocalStorage(api);
        const { value } = await api.secrets.get({ key: 'finance.twelveData' });
        set({
          twelveDataKeyConfigured: Boolean(value?.trim()),
          secretsHydrated: true,
        });
      },

      addAsset: (asset) => {
        const { assets } = get();
        if (assets.length >= FINANCE_WATCHLIST_MAX) return;
        if (assets.some((a) => assetKey(a) === assetKey(asset))) return;
        set({ assets: [...assets, asset] });
      },
      removeAsset: (key) => set((s) => ({ assets: s.assets.filter((a) => assetKey(a) !== key) })),
      setApiKey: async (key) => {
        const api = bridge();
        if (!api) return;
        await api.secrets.set({ key: 'finance.twelveData', value: key });
        set({ twelveDataKeyConfigured: key.trim() !== '' });
      },
    }),
    {
      name: FINANCE_PERSIST_KEY,
      version: 2,
      partialize: (state) => ({ assets: state.assets }),
      migrate: (persisted, version) => {
        const row = persisted as LegacyPersisted & { assets?: FinanceAsset[] };
        if (version < 2 && row.state && typeof row.state === 'object') {
          return { assets: row.state.assets ?? [] };
        }
        return { assets: row.assets ?? [] };
      },
    },
  ),
);
