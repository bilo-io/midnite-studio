import type { NavConfig } from '@midnite/studio-frame';
import { LuArrowLeftRight, LuBookOpen, LuCalculator, LuChartColumn, LuLayoutDashboard, LuListTree } from 'react-icons/lu';

import { accountantManifest } from '../manifest';

/** The six rail rows the module contributes; each lands on the matching tab of the books workspace. */
export const ACCOUNTANT_VIEWS = [
  { id: 'accountant.overview', label: 'Overview', icon: LuLayoutDashboard },
  { id: 'accountant.journal', label: 'Journal', icon: LuBookOpen },
  { id: 'accountant.accounts', label: 'Accounts', icon: LuListTree },
  { id: 'accountant.reports', label: 'Reports', icon: LuChartColumn },
  { id: 'accountant.tax', label: 'Tax', icon: LuCalculator },
  { id: 'accountant.import', label: 'Import', icon: LuArrowLeftRight },
] as const;

const ACCOUNTANT_NAV: NavConfig = { views: ACCOUNTANT_VIEWS };

/** The module's app manifest — pure data; `accent` matches the launcher's `accountant` tile. */
export const ACCOUNTANT_APP = {
  id: 'accountant',
  name: 'Midnite Accountant',
  tagline: 'Double-entry books that stay on this computer',
  accent: accountantManifest.accent,
  home: 'accountant.overview',
  features: accountantManifest.features,
  nav: ACCOUNTANT_NAV,
} as const;

export type AccountantApp = typeof ACCOUNTANT_APP;
