import {
  CaptureHostProvider,
  STANDALONE_CAPTURE_HOST,
} from '@midnite/studio-feature-capture/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { CAPTURE_CHROME, CaptureDialogHost } from './compose/capture-chrome';
import { CaptureHome } from './views/capture-home';

/**
 * Midnite Capture — the capture feature composed over the frame as its own app: the frame chrome (its
 * confirm dialogs) and the standalone host, which reaches no other feature.
 */
export function CaptureApp() {
  return (
    <FrameChromeProvider chrome={CAPTURE_CHROME}>
      <CaptureHostProvider host={STANDALONE_CAPTURE_HOST}>
        <CaptureHome />
      </CaptureHostProvider>
      <ReportIssueHost app="midnite-capture" />
      <CaptureDialogHost />
    </FrameChromeProvider>
  );
}
