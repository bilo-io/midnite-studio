import { financeManifest } from '@midnite/studio-feature-finance/renderer';

/**
 * Money's app manifest — pure data (Phase 113 Theme P).
 *
 * `accent` matches the launcher catalog's `money` tile; the glyph is the catalog's too
 * (`PiChartLineUpFill`, rendered by the home view and baked into `resources/icon.icns` by
 * the launcher's `scripts/app-icons.cjs`). `home` names the one surface Money opens on — its own portfolio and
 * markets board, not Studio's dashboard.
 */
export const MONEY_APP = {
  id: 'money',
  name: 'Midnite Money',
  tagline: 'Stocks, crypto and a portfolio in one place',
  accent: '#84cc16',
  home: 'markets',
  features: [financeManifest.feature],
} as const;

export type MoneyApp = typeof MONEY_APP;
