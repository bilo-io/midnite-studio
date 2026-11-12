import type { NavGroup } from '@midnite/studio-frame';
import { LuChartCandlestick } from 'react-icons/lu';
import { PiCoinsFill } from 'react-icons/pi';

import { moneyManifest } from '../manifest';

/**
 * Money's nav group in a host's rail: its one view (Settings sits below it, so the rail is never one item).
 * Settings is never listed — the shell puts it at the rail's foot.
 */
export const MONEY_NAV_GROUP: NavGroup = {
  id: 'money',
  label: moneyManifest.label,
  icon: PiCoinsFill,
  accent: moneyManifest.accent,
  views: [{ id: 'markets', label: 'Markets', icon: LuChartCandlestick }],
};
