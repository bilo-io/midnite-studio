import { navFromModules } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { CLEANER_NAV_GROUP } from '@midnite/studio-module-cleaner/renderer';
import { MONITOR_NAV_GROUP } from '@midnite/studio-module-monitor/renderer';
import { VANGUARD_NAV_GROUP } from '@midnite/studio-module-vanguard/renderer';
import { VAULT_NAV_GROUP } from '@midnite/studio-module-vault/renderer';

/**
 * The Vanguard host's rail (Phase 124 Theme E.3): one titled group per module in `APP_MODULES.vanguard`
 * — Vanguard, Vault, Cleaner, Monitor — each module's views beneath its label.
 */
export const VANGUARD_HOST_NAV = navFromModules(APP_MODULES.vanguard, {
  vanguard: VANGUARD_NAV_GROUP,
  vault: VAULT_NAV_GROUP,
  cleaner: CLEANER_NAV_GROUP,
  monitor: MONITOR_NAV_GROUP,
});
