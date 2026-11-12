import { navFromModules } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { ACCOUNTANT_NAV_GROUP } from '@midnite/studio-module-accountant/renderer';
import { MONEY_NAV_GROUP } from '@midnite/studio-module-money/renderer';

/**
 * The Money host's rail (Phase 129 Theme A): one titled group per module in `APP_MODULES.money` — Money,
 * Accountant — each module's views beneath its label.
 */
export const MONEY_HOST_NAV = navFromModules(APP_MODULES.money, {
  money: MONEY_NAV_GROUP,
  accountant: ACCOUNTANT_NAV_GROUP,
});
