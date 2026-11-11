import { navFromModules } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { STARTUP_NAV_GROUP } from '@midnite/studio-module-startup/renderer';

/**
 * The Startup host's rail (Phase 130 Theme A): one titled group per module in `APP_MODULES.startup`, each
 * module's views beneath its label. Theme F adds the Accountant group.
 */
export const STARTUP_HOST_NAV = navFromModules(APP_MODULES.startup, {
  startup: STARTUP_NAV_GROUP,
});
