import { createMonitorSegment } from '@midnite/studio-frame';
import { MonitorFlyout } from '@midnite/studio-feature-monitor/renderer';

import { requestHandoff } from '../../services/handoff';
import { runFullRecoveryFromWidget } from './full-recovery';
import { buildRecoveryActions, usePreviousBuildAttention } from './recovery-actions';

/**
 * Studio's monitor segment (Phase 123 Theme K). The cluster itself is the frame's, shared by every
 * suite app; Studio supplies the monitor feature's flyout, its in-process hand-off, and (Phase 148)
 * the recovery actions and the previous-build badge. Suite apps pass neither.
 */
export const MonitorCluster = createMonitorSegment({
  Flyout: MonitorFlyout,
  openMonitor: () => void requestHandoff({ app: 'monitor', view: 'monitor' }),
  actions: buildRecoveryActions({ fullRecovery: runFullRecoveryFromWidget }),
  attention: usePreviousBuildAttention,
});
