import { captureViews } from '@midnite/studio-feature-capture/renderer';
import { lazy, Suspense } from 'react';
import { PiCameraFill } from 'react-icons/pi';

import { CAPTURE_APP } from '../capture-manifest';

const CapturePage = lazy(() =>
  captureViews.capture().then((Component) => ({ default: Component })),
);

/** What Capture shows on open: the accent mark and name on top, the Capture view below. */
export function CaptureHome() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: CAPTURE_APP.accent }}
        >
          <PiCameraFill className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">{CAPTURE_APP.name}</p>
        <p className="text-xs text-muted-foreground">{CAPTURE_APP.tagline}</p>
      </header>
      <main className="min-h-0 flex-1 overflow-auto" aria-label="Capture">
        <Suspense fallback={null}>
          <CapturePage />
        </Suspense>
      </main>
    </div>
  );
}
