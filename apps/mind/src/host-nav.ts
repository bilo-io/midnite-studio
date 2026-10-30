import { navFromModules } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { CAPTURE_NAV_GROUP } from '@midnite/studio-module-capture/renderer';
import { MIND_NAV_GROUP } from '@midnite/studio-module-mind/renderer';

/**
 * The Mind host's rail (Phase 124 Theme E.3): one titled group per module in `APP_MODULES.mind` — Mind,
 * Capture — each module's views beneath its label.
 */
export const MIND_HOST_NAV = navFromModules(APP_MODULES.mind, {
  mind: MIND_NAV_GROUP,
  capture: CAPTURE_NAV_GROUP,
});
