import { studioBrowserLink, studioViewLink } from '@midnite/studio-shared/studio-link';

import {
  LEGACY_APP_HOSTS,
  MODULE_FEATURE_PREFIX,
  appById,
  openTarget,
  type AppId,
  type RetiredLauncherAppId,
  type StudioTarget,
} from '../common/catalog';

export function targetLink(target: StudioTarget): string {
  return target.kind === 'browser' ? studioBrowserLink(target.url) : studioViewLink(target.view, target.tab);
}

/**
 * The `midnite-studio://` link an Open lands on: the feature's own target when
 * one is named and known, a module's front door for `module:<id>`, the app's front door otherwise.
 */
export function appLink(id: AppId | RetiredLauncherAppId, featureId?: string): string {
  // A retired id (an old link, a placement) opens its host on the module it became.
  if (Object.hasOwn(LEGACY_APP_HOSTS, id)) {
    const { app, module } = LEGACY_APP_HOSTS[id as RetiredLauncherAppId];
    return targetLink(openTarget(appById(app), featureId ?? `${MODULE_FEATURE_PREFIX}${module}`));
  }
  return targetLink(openTarget(appById(id as AppId), featureId));
}
