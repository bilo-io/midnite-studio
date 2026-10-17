import { createFrameChrome, FrameChromeProvider, MediaKitProvider, type MediaKit } from '@midnite/studio-frame';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

/**
 * A `render` for this package's component tests: the panels draw with the frame's chrome (`IconButton`,
 * dialogs) and the media kit's tooltip, which an app installs around them — here the frame's kit chrome and a
 * kit that is only a pass-through tooltip. The tests under test are about the panel, not the chrome.
 */
const kit = { Tooltip: ({ children }: { children: ReactElement }) => children } as unknown as MediaKit;

function Wrapper({ children }: { children: ReactNode }) {
  const { chrome } = createFrameChrome();
  return (
    <FrameChromeProvider chrome={chrome}>
      <MediaKitProvider kit={kit}>{children}</MediaKitProvider>
    </FrameChromeProvider>
  );
}

export function render(ui: ReactElement, options: Omit<RenderOptions, 'wrapper'> = {}) {
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}
