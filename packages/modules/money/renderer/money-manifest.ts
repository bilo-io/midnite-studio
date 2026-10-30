import { financeManifest } from '@midnite/studio-feature-finance/renderer';
import { navFromModules, type NavConfig } from '@midnite/studio-frame';
import { LuChartCandlestick } from 'react-icons/lu';
import { APP_MODULES } from '@midnite/studio-shared';
import { PiCoinsFill } from 'react-icons/pi';
import { moneyManifest } from '../manifest';

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
 * The rail, derived from `APP_MODULES.money` (Phase 124 Theme E.2): one titled group per module the host mounts,
 * this module's views beneath. Modules the host does not mount yet have no entry, so wiring one in (E.3) adds
 * its group here and nothing else.
 */
const MONEY_HOST_NAV: NavConfig = navFromModules(APP_MODULES.money, {
  money: { id: 'money', label: moneyManifest.label, icon: PiCoinsFill, accent: moneyManifest.accent, views: MONEY_NAV.views },
});

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
  nav: MONEY_HOST_NAV,
} as const;

export type MoneyApp = typeof MONEY_APP;
