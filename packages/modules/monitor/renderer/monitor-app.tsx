import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { MONITOR_CHROME, MonitorDialogHost } from './compose/monitor-chrome';
import { MonitorHome } from './views/monitor-home';

/**
 * Midnite Monitor — the monitor feature composed over the frame as its own app.
 * The feature needs no host port (it owns no app state), only the frame chrome.
 */
export function MonitorApp() {
  return (
    <FrameChromeProvider chrome={MONITOR_CHROME}>
      <MonitorHome />
      <MonitorDialogHost />
      <ReportIssueHost app="midnite-monitor" />
    </FrameChromeProvider>
  );
}
