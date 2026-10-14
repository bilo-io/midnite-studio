import { studioBrowserLink, studioViewLink } from '@midnite/studio-shared/studio-link';

import { appById, type AppId, type StudioTarget } from '../common/catalog';

export function targetLink(target: StudioTarget): string {
  return target.kind === 'browser' ? studioBrowserLink(target.url) : studioViewLink(target.view, target.tab);
}

/**
 * The `midnite-studio://` link an Open lands on: the feature's own target when
 * one is named and known, the app's front door otherwise.
 */
export function appLink(id: AppId, featureId?: string): string {
  const app = appById(id);
  const feature = featureId === undefined ? undefined : app.features.find((f) => f.id === featureId);
  return targetLink(feature?.target ?? app.home);
}
