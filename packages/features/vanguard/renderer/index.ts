import type { ComponentType } from 'react';

import type { VanguardManifest } from '../manifest';

/**
 * The vanguard feature's renderer half (Phase 120 Theme B). Needs only the frame (bridge, settings
 * primitives): it owns no host port, because it owns no app state beyond the selected tab.
 */
export { vanguardManifest, type VanguardManifest } from '../manifest';
export { VanguardSettingsPage } from './settings-page';
export { useVanguardUi } from './vanguard-ui-store';

type ViewIds = VanguardManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const vanguardViews = {
  vanguard: () => import('./vanguard-page').then((m) => m.VanguardPage),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
