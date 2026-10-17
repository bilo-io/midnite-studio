import { net, session, WebContentsView, type BrowserWindow } from 'electron';

import type { GameElectron, GamePopoutWindow, GameSession, GameViewOptions, GameWindow } from '@midnite/studio-feature-media-game/main';

import { cancelDownload } from '@midnite/studio-feature-browser/main';

/**
 * The Electron pieces Studio hands the games feature's runner (Phase 113 Theme S): a game's sandboxed
 * `WebContentsView` and its own session, the download refusal and `net.fetch` for the `mstudio-game:`
 * protocol. The feature declares narrow structural ports for all of them (it may not import `electron`);
 * Electron's real classes are wider and overloaded, so they are cast once, here.
 */
export function createStudioGameElectron(): GameElectron<WebContentsView> {
  const electron: GameElectron<WebContentsView> extends infer E ? { [K in keyof E]: unknown } : never = {
    sessionFromPartition: (partition: string) => session.fromPartition(partition) as unknown as GameSession,
    createView: (options: GameViewOptions) => new WebContentsView(options as ConstructorParameters<typeof WebContentsView>[0]),
    cancelDownload,
    fetchFile: (url: string, init: RequestInit) => net.fetch(url, init),
  };
  return electron as unknown as GameElectron<WebContentsView>;
}

/** The main window, as the runner's window port. */
export const asGameWindow = (getWindow: () => BrowserWindow | null): (() => GameWindow | null) =>
  getWindow as unknown as () => GameWindow | null;

/** The popout (`game` role) window, as the popout's window port. */
export const asPopoutWindow = (open: () => BrowserWindow): (() => GamePopoutWindow) => open as unknown as () => GamePopoutWindow;
