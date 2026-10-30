import { createMonitorSegment } from '@midnite/studio-frame';
import { MonitorFlyout } from '@midnite/studio-feature-monitor/renderer';

import { requestHandoff } from '../../services/handoff';

/**
 * Studio's monitor segment (Phase 123 Theme K). The cluster itself is the frame's, shared by every
 * suite app; Studio supplies the monitor feature's flyout and its in-process hand-off.
 */
export const MonitorCluster = createMonitorSegment({
  Flyout: MonitorFlyout,
  openMonitor: () => void requestHandoff({ app: 'monitor', view: 'monitor' }),
});
