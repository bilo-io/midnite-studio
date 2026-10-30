import { navFromModules } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { CREATOR_NAV_GROUP } from '@midnite/studio-module-creator/renderer';
import { GAMER_NAV_GROUP } from '@midnite/studio-module-gamer/renderer';

/**
 * The Gamer host's rail (Phase 124 Theme E.3): one titled group per module in `APP_MODULES.gamer` — Gamer and
 * Creator — each module's views beneath its label.
 */
export const GAMER_HOST_NAV = navFromModules(APP_MODULES.gamer, {
  gamer: GAMER_NAV_GROUP,
  creator: CREATOR_NAV_GROUP,
});
