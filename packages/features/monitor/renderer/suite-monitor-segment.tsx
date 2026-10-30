import type { ComponentType } from 'react';

import { createMonitorSegment, handOff } from '@midnite/studio-frame';
import type { HandoffAppId, HandoffRequest } from '@midnite/studio-shared';

import { MonitorFlyout } from './monitor-flyout';

export type SuiteMonitorSegmentOptions = {
  /** The apps this process hosts. Vanguard hosts `monitor`; every other app hands it off. */
  hosted: ReadonlySet<HandoffAppId>;
  /** In-process navigation for a hosted target — Vanguard's own view switch. */
  navigate?: (request: HandoffRequest) => void;
};

/**
 * The status bar's monitor segment for a suite app (Phase 123 Theme H): the frame's cluster over this
 * feature's flyout, with "Open Monitor" going through the app's hand-off — in place where the app hosts
 * Monitor, else a `midnite://open` link the launcher routes. Build it once at module scope: the result is
 * a component, and a new one per render would remount the cluster.
 */
export function createSuiteMonitorSegment({ hosted, navigate }: SuiteMonitorSegmentOptions): ComponentType {
  return createMonitorSegment({
    Flyout: MonitorFlyout,
    openMonitor: () => void handOff({ app: 'monitor', view: 'monitor' }, { hosted, ...(navigate ? { navigate } : {}) }),
  });
}
