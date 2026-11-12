import { navFromModules } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { HEALTH_NAV_GROUP } from '@midnite/studio-module-health/renderer';

/**
 * The Health host's rail (Phase 128 Theme A.4): one titled group per module in `APP_MODULES.health` the host
 * mounts. Health only for now; Health is a one-module host.
 */
export const HEALTH_HOST_NAV = navFromModules(APP_MODULES.health, {
  health: HEALTH_NAV_GROUP,
});
