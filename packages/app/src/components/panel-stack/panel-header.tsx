import { FrameChromeProvider, PanelHeader as FramePanelHeader } from '@midnite/studio-frame';

import { STUDIO_CHROME } from '../../compose/studio-chrome';

/**
 * Moved to the frame (Phase 113 Theme N) — kept so the app's own importers (the
 * workflow editor, the task card stack) do not move. The frame's header draws
 * its arrows through the chrome port; this wrapper installs Studio's chrome
 * around it, so a surface that renders it without `StudioProviders` (the
 * unit tests that mount a bare view) still has an `IconButton` to draw with.
 * Inside the real window the provider above it is the same object.
 */
export function PanelHeader<T>(props: Parameters<typeof FramePanelHeader<T>>[0]) {
  return (
    <FrameChromeProvider chrome={STUDIO_CHROME}>
      <FramePanelHeader {...props} />
    </FrameChromeProvider>
  );
}
