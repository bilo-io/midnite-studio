import type { NavGroup } from '@midnite/studio-frame';
import { PiCalculatorFill } from 'react-icons/pi';

import { accountantManifest } from '../manifest';
import { ACCOUNTANT_VIEWS } from './accountant-manifest';

/**
 * Accountant's nav group in a host's rail: its six views. A host composes it with `navFromModules`; the
 * module's accent shows on the group label only.
 */
export const ACCOUNTANT_NAV_GROUP: NavGroup = {
  id: 'accountant',
  label: accountantManifest.label,
  icon: PiCalculatorFill,
  accent: accountantManifest.accent,
  views: ACCOUNTANT_VIEWS.map(({ id, label, icon }) => ({ id, label, icon })),
};
