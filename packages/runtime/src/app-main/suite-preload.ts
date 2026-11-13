import type { DesktopPlatform, MidniteStudioBridge } from '@midnite/studio-shared';
import { APP_VERSION_ARG, CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createBridgeSlice, type RendererIpc } from './bridge-slice';
import { createWindowChromeBridge } from './window-chrome-preload';

/**
 * The bridge slices the shell reads in every suite app (Phase 123 Theme H): `windowChrome`, which
 * backs `<TitleBar>`, and `suitePrefs`, the shared preferences file. An app's preload spreads this into
 * its `unionBridgeSlices(...)` call; the matching main half is `registerSuiteMain`.
 */
export function createSuiteBridge(
  ipc: RendererIpc,
  argv: readonly string[],
  /** `process.platform`. */
  platform: string,
): Pick<MidniteStudioBridge, 'windowChrome' | 'suitePrefs' | 'appVersion'> &
  Required<Pick<MidniteStudioBridge, 'suiteLink' | 'suiteReleaseNotes'>> {
  const { call, subscribe } = createBridgeSlice(ipc);
  // Same route as Studio's preload: only main can ask Electron for the version. `0.0.0` when absent, which
  // the renderer reads as "unknown" rather than mistaking a missing value for a current one.
  const versionArg = argv.find((a) => a.startsWith(APP_VERSION_ARG));
  const appVersion = versionArg?.slice(APP_VERSION_ARG.length) || '0.0.0';
  return {
    appVersion,
    windowChrome: createWindowChromeBridge(ipc, argv, platform as DesktopPlatform),
    suitePrefs: {
      get: () => call(CHANNELS.suitePrefsGet),
      set: (req) => call(CHANNELS.suitePrefsSet, req),
      onChanged: (handler) => subscribe(EVENT_CHANNELS.suitePrefsChanged, handler),
    },
    suiteReleaseNotes: { get: (req) => call(CHANNELS.suiteReleaseNotes, req) },
    suiteLink: {
      take: () => call(CHANNELS.suiteLinkTake),
      onOpen: (handler) => subscribe(EVENT_CHANNELS.suiteLinkOpen, handler),
    },
  };
}
