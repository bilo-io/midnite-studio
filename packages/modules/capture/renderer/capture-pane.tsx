import { lazy, Suspense } from 'react';

import { CaptureHostProvider, STANDALONE_CAPTURE_HOST, captureViews } from '@midnite/studio-feature-capture/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { CAPTURE_CHROME, CaptureDialogHost } from './compose/capture-chrome';

const CapturePage = lazy(() => captureViews.capture().then((Component) => ({ default: Component })));

/**
 * Capture as a pane inside a host's shell (Phase 124 Theme E.3): the capture view over the standalone host
 * port, its own confirm dialogs, no app header and no `ReportIssueHost` — the host owns the one entry.
 */
export function CapturePane() {
  return (
    <FrameChromeProvider chrome={CAPTURE_CHROME}>
      <CaptureHostProvider host={STANDALONE_CAPTURE_HOST}>
        <main className="h-full min-h-0 overflow-auto" aria-label="Capture">
          <Suspense fallback={null}>
            <CapturePage />
          </Suspense>
        </main>
      </CaptureHostProvider>
      <CaptureDialogHost />
    </FrameChromeProvider>
  );
}
