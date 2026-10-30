import type { OptimizerHost } from '@midnite/studio-feature-optimizer/renderer';

import { useMonitorPrefsStore } from '@midnite/studio-frame';

import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the optimizer feature's host port (Phase 113 Theme C).
 *
 * The optimizer's settings stay where they have always been persisted —
 * `ui-store`, with its migrations — so moving the feature into a package
 * changed no stored key. `UiState` is (almost) a structural superset of the port's
 * `OptimizerSettingsState`, which is why each member is one line, and
 * `satisfies` is what keeps it true: rename a setting on either side and
 * `app:typecheck` fails here.
 */
export const STUDIO_OPTIMIZER_HOST = {
  // `metricsIdleIntervalMs` moved to the suite-prefs monitor group (Phase 123 Theme K), so the
  // port's state is `ui-store` plus that one field.
  useSettings: (selector) => {
    const metricsIdleIntervalMs = useMonitorPrefsStore((state) => state.metricsIdleIntervalMs);
    return useUiStore((state) => selector({ ...state, metricsIdleIntervalMs }));
  },
  getSettings: () => ({
    ...useUiStore.getState(),
    metricsIdleIntervalMs: useMonitorPrefsStore.getState().metricsIdleIntervalMs,
  }),
} satisfies OptimizerHost;
