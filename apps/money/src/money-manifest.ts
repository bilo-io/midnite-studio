import { financeManifest } from '@midnite/studio-feature-finance/renderer';
import type { NavConfig } from '@midnite/studio-frame';
import { LuChartCandlestick } from 'react-icons/lu';

/**
 * The shell's rail (Phase 123 Theme B): its one view (Settings sits below it, so the rail is never one
 * item). Settings is never listed — `AppShell` puts it at the rail's foot. `panels` is absent, so the
 * app carries every panel (decision 12).
 */
const MONEY_NAV: NavConfig = {
  views: [
    { id: 'markets', label: 'Markets', icon: LuChartCandlestick },
  ],
};

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
  nav: MONEY_NAV,
} as const;

export type MoneyApp = typeof MONEY_APP;
