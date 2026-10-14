import type { OptimizerHost } from '@midnite/studio-feature-optimizer/renderer';

import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the optimizer feature's host port (Phase 113 Theme C).
 *
 * The optimizer's settings stay where they have always been persisted —
 * `ui-store`, with its migrations — so moving the feature into a package
 * changed no stored key. `UiState` is a structural superset of the port's
 * `OptimizerSettingsState`, which is why each member is one line, and
 * `satisfies` is what keeps it true: rename a setting on either side and
 * `app:typecheck` fails here.
 */
export const STUDIO_OPTIMIZER_HOST = {
  useSettings: (selector) => useUiStore((state) => selector(state)),
  getSettings: () => useUiStore.getState(),
} satisfies OptimizerHost;
