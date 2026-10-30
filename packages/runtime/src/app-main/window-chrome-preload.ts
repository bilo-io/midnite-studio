import type { DesktopPlatform, WindowChromeBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS, WINDOW_FRAMELESS_ARG } from '@midnite/studio-shared';

import { createBridgeSlice, type RendererIpc } from './bridge-slice';

/**
 * The `windowChrome` slice of an app's preload bridge — `@bilo-io/shell`'s `WindowChromeBridge`, which
 * backs `<TitleBar>`. `frameless` comes from the launch argument main set (`suiteWindowOptions`), never
 * from `process.platform`; a missing argument reads as framed so a native title bar is never lost to it.
 * Fullscreen and focus ride one `window:state-changed` push so they cannot arrive out of order.
 */
export function createWindowChromeBridge(
  ipc: RendererIpc,
  argv: readonly string[],
  platform: DesktopPlatform,
): WindowChromeBridge {
  const { send, subscribe } = createBridgeSlice(ipc);
  const arg = argv.find((a) => a.startsWith(WINDOW_FRAMELESS_ARG));
  return {
    platform,
    frameless: arg?.slice(WINDOW_FRAMELESS_ARG.length) === '1',
    onFullscreenChange: (handler) =>
      subscribe<{ fullScreen: boolean }>(EVENT_CHANNELS.windowStateChanged, (s) => handler(s.fullScreen)),
    onFocusChange: (handler) =>
      subscribe<{ focused: boolean }>(EVENT_CHANNELS.windowStateChanged, (s) => handler(s.focused)),
    setBackgroundColor: (color) => send(CHANNELS.windowSetBackground, color),
  };
}
