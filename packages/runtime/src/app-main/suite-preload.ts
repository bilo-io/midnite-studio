import type { DesktopPlatform, MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createBridgeSlice, type RendererIpc } from './bridge-slice';
import { createWindowChromeBridge } from './window-chrome-preload';

/**
 * The two bridge slices the shell reads in every suite app (Phase 123 Theme H): `windowChrome`, which
 * backs `<TitleBar>`, and `suitePrefs`, the shared preferences file. An app's preload spreads this into
 * its `unionBridgeSlices(...)` call; the matching main half is `registerSuiteMain`.
 */
export function createSuiteBridge(
  ipc: RendererIpc,
  argv: readonly string[],
  /** `process.platform`. */
  platform: string,
): Pick<MidniteStudioBridge, 'windowChrome' | 'suitePrefs'> & Required<Pick<MidniteStudioBridge, 'suiteLink'>> {
  const { call, subscribe } = createBridgeSlice(ipc);
  return {
    windowChrome: createWindowChromeBridge(ipc, argv, platform as DesktopPlatform),
    suitePrefs: {
      get: () => call(CHANNELS.suitePrefsGet),
      set: (req) => call(CHANNELS.suitePrefsSet, req),
      onChanged: (handler) => subscribe(EVENT_CHANNELS.suitePrefsChanged, handler),
    },
    suiteLink: {
      take: () => call(CHANNELS.suiteLinkTake),
      onOpen: (handler) => subscribe(EVENT_CHANNELS.suiteLinkOpen, handler),
    },
  };
}
