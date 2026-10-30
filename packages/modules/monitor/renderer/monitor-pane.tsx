import { FrameChromeProvider } from '@midnite/studio-frame';

import { MONITOR_CHROME, MonitorDialogHost } from './compose/monitor-chrome';
import { MonitorHome } from './views/monitor-home';

/** Monitor as a pane inside a host's shell (Phase 124 Theme E.3): chrome, the view, no app header, no report host. */
export function MonitorPane() {
  return (
    <FrameChromeProvider chrome={MONITOR_CHROME}>
      <MonitorHome embedded />
      <MonitorDialogHost />
    </FrameChromeProvider>
  );
}
