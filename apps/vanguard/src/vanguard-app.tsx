import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { VANGUARD_CHROME, VanguardDialogHost } from './compose/vanguard-chrome';
import { VanguardHome } from './views/vanguard-home';

/**
 * Midnite Vanguard — the vanguard feature composed over the frame as its own app.
 * The feature needs no host port (it owns no app state), only the frame chrome.
 */
export function VanguardApp() {
  return (
    <FrameChromeProvider chrome={VANGUARD_CHROME}>
      <VanguardHome />
      <VanguardDialogHost />
      <ReportIssueHost app="midnite-vanguard" />
    </FrameChromeProvider>
  );
}
