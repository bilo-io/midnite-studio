import { navFromModules } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { CREATOR_NAV_GROUP } from '@midnite/studio-module-creator/renderer';
import { MEDIA_NAV_GROUP } from '@midnite/studio-module-media/renderer';

/**
 * The Media host's rail (Phase 124 Theme E.3): one titled group per module in `APP_MODULES.media` — Media and
 * Creator — each module's views beneath its label.
 */
export const MEDIA_HOST_NAV = navFromModules(APP_MODULES.media, {
  media: MEDIA_NAV_GROUP,
  creator: CREATOR_NAV_GROUP,
});
