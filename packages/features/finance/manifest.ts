import { CHANNELS, defineFeatureManifest } from '@midnite/studio-shared';

/**
 * The finance feature — Money's one feature (Phase 113 Theme P), copying the
 * optimizer's template (`../optimizer/manifest.ts`).
 *
 * One package for both of the placement map's old finance folders: `finance`
 * (the Finance panel, the status-bar segment, the watchlist store) and
 * `finance-dashboard` (the dashboard widgets over the markets service). They
 * share the same providers, the same queries and the same store, so two
 * packages would only have been a seam through the middle of one thing.
 *
 * **No view of its own.** Finance reaches the user as dashboard widgets and a
 * status-bar segment, which each composing app places itself — Studio on its
 * dashboard and status bar, Money on its home. `views` is therefore empty and
 * `FEATURE_VIEWS` has no `finance` row.
 *
 * **The market-data key stays in main.** `finance.twelveData` is read by the
 * `financeSearch`/`financeQuote`/`financeHistory` handlers through
 * `FinanceMainServices.twelveDataKey` and never answers any channel; the
 * renderer learns only whether one is set (`secretsHas`).
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const financeManifest = defineFeatureManifest({
  feature: 'finance',
  owner: 'money',
  views: [],
  settingsPages: [],
  ipc: [
    CHANNELS.financeSearch,
    CHANNELS.financeQuote,
    CHANNELS.financeHistory,
    CHANNELS.financeAccountsList,
    CHANNELS.financeAccountTest,
    CHANNELS.financeAccountAdd,
    CHANNELS.financeAccountRemove,
    CHANNELS.financeAccountSnapshots,
    CHANNELS.marketsSeries,
    CHANNELS.marketsQuotes,
    CHANNELS.marketsSearch,
    CHANNELS.marketsRates,
    CHANNELS.marketsPortfolioGet,
    CHANNELS.marketsPortfolioApply,
    CHANNELS.marketsNews,
  ],
  events: [],
  mcpTools: [],
});

export type FinanceManifest = typeof financeManifest;
