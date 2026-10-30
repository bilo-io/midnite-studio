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
// Moved to the frame (Phase 123 Theme K) — the status bar's monitor segment draws them.
export { MetricDonut, Sparkline } from '@midnite/studio-frame';
export { MonitorFlyout } from './monitor-flyout';

type ViewIds = MonitorManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const monitorViews = {
  monitor: () => import('./monitor-page').then((m) => m.MonitorPage),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
export { createSuiteMonitorSegment, type SuiteMonitorSegmentOptions } from './suite-monitor-segment';
