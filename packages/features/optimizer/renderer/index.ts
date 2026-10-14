import type { ComponentType } from 'react';

import type { OptimizerManifest } from '../manifest';
import { OptimizerSettingsPage } from './settings/optimizer-settings-page';
import { TrashSafetyPage } from './settings/trash-safety-page';

/**
 * The optimizer feature's renderer half — what an app composer mounts
 * (Phase 113 Theme C).
 *
 * Keyed by the manifest's ids, and `satisfies` makes a missing or extra key a
 * type error: a view or settings page the manifest names cannot ship without
 * a component, and a component cannot ship that the manifest does not name.
 *
 * The composer must also install {@link OptimizerHostProvider} — this
 * feature's port onto app state it does not own (see `host.tsx`) — and the
 * frame's `FrameChromeProvider`.
 *
 * `sideEffects: false` in package.json is load-bearing: an app that imports
 * only `optimizerViews` (to register the lazy view) must not drag the settings
 * pages into its entry chunk.
 */
export { optimizerManifest, type OptimizerManifest } from '../manifest';
export {
  OptimizerHostProvider,
  useOptimizerHost,
  type OptimizerHost,
  type OptimizerSettingsState,
} from './host';

type ViewIds = OptimizerManifest['views'][number]['id'];
type SettingsPageIds = OptimizerManifest['settingsPages'][number];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const optimizerViews = {
  optimizer: () => import('./optimizer-page').then((m) => m.OptimizerPage),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;

/** Each settings page; the frame's Settings view renders the running app's pages. */
export const optimizerSettingsPages = {
  trashSafety: TrashSafetyPage,
  optimizer: OptimizerSettingsPage,
} satisfies Record<SettingsPageIds, ComponentType>;
