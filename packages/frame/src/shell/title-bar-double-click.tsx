import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';

import type { WindowChromeBridge } from '@midnite/studio-shared';

/** Anything in the bar a user can operate: a double-click on one of these is theirs, not the window's. */
const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [role="tab"], [role="menuitem"], [contenteditable="true"]';

/**
 * Wraps the frameless `<TitleBar>` so a double-click on its drag region maximises or restores the window
 * (Phase 123 Theme A). A frameless window has no native bar for macOS to zoom from, so the renderer
 * reports it over `windowChrome.toggleMaximize` and main does the zoom. A no-op in full screen (main
 * ignores it too), and a double-click on a control in the bar's slots is left alone. No
 * `AppleActionOnDoubleClick` read — Studio does not read it either.
 *
 * `display: contents` keeps the wrapper out of layout: the bar is placed by `AppFrame` exactly as before.
 */
export function TitleBarDoubleClick({ windowChrome, children }: { windowChrome: WindowChromeBridge | null; children: ReactNode }) {
  const fullScreen = useRef(false);
  useEffect(() => {
    if (windowChrome === null) return undefined;
    return windowChrome.onFullscreenChange((value) => {
      fullScreen.current = value;
    });
  }, [windowChrome]);

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (windowChrome === null || !windowChrome.frameless || fullScreen.current) return;
    if (event.target instanceof Element && event.target.closest(INTERACTIVE) !== null) return;
    windowChrome.toggleMaximize?.();
  };

  return (
    // The bar is a drag region, not a control: the keyboard has the OS's own window shortcuts.
    <div style={{ display: 'contents' }} onDoubleClick={onDoubleClick}>
      {children}
    </div>
  );
}
