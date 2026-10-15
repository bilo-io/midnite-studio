import type { ComponentType } from 'react';

import type { MonitorManifest } from '../manifest';

/**
 * The monitor feature's renderer half (Phase 113 Theme I). Needs only the
 * frame (bridge, metrics store, charts): no host port, because it owns no
 * app state — the status-bar cluster and Settings pages that read `ui-store`
 * stay in Studio's app.
 *
 * `sideEffects: false` keeps an app that imports only `monitorViews` from
 * pulling the status-bar parts into its entry chunk.
 */
export { monitorManifest, type MonitorManifest } from '../manifest';
export { MetricDonut } from './metric-donut';
export { MonitorFlyout } from './monitor-flyout';
export { Sparkline } from './sparkline';

type ViewIds = MonitorManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const monitorViews = {
  monitor: () => import('./monitor-page').then((m) => m.MonitorPage),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
