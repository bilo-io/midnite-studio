import { navFromModules } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { SCIENCE_NAV_GROUP } from '@midnite/studio-module-science/renderer';

/**
 * The Science host's rail (Phase 126 Theme A.4): one titled group per module in `APP_MODULES.science` the host
 * mounts. Science only for now; Phase 127 adds the Simulator group.
 */
export const SCIENCE_HOST_NAV = navFromModules(APP_MODULES.science, {
  science: SCIENCE_NAV_GROUP,
});
