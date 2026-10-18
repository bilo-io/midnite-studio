import { join } from 'node:path';

import {
  CAPTURE_DATA_DIR,
  captureEmitter,
  captureMain,
  createCaptureService,
  createDisplayMediaGate,
  electronCapturePort,
  type CaptureElectronModules,
  type CaptureService,
  type DisplayMediaGate,
} from '@midnite/studio-feature-capture/main';
import { isAppOrigin } from '@midnite/studio-feature-browser/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { CAPTURE_DEFAULT_SETTINGS, failure, ok } from '@midnite/studio-shared';
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  globalShortcut,
  nativeImage,
  screen,
  shell,
  systemPreferences,
} from 'electron';

import { setCaptureFileResolver } from '../fs-protocol';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';
import { mediaStore } from './media-handlers';

/**
 * Studio's composition of the capture feature's main half (Phase 113 Theme K slice 1).
 *
 * - Everything lives under `<userData>/capture` — captures, the opt-in clipboard history, the settings.
 * - No capture happens without a click (or the user's own chord). Every grab reads the Screen Recording
 *   permission first; macOS's prompt is only ever asked for from the permission panel's "Ask macOS".
 * - Recording goes through the one-shot gate {@link captureGate} installs on the default session: an
 *   unarmed `getDisplayMedia` gets no stream.
 * - Studio ships **no** global chord by default (the user sets one in Capture's settings); clipboard
 *   history is off until the user switches it on.
 * - Send to: `chat` (the renderer's chats slot) and `creator` (the bytes written into the selected repo's
 *   Creator ▸ Images ▸ Captures through the media store). Nothing is posted anywhere.
 * - Files reach the renderer over the existing `mstudio-file:` scheme's `capture` host, so the CSP is
 *   unchanged.
 */
let gate: DisplayMediaGate | null = null;
let service: CaptureService | null = null;

/**
 * The recording gate for the app's own session — created before any window exists, so `index.ts` can OR
 * its `allowsPermission` into the permission handlers and install its `handleRequest`.
 */
export function captureGate(devServerOrigin: string | null): DisplayMediaGate {
  gate ??= createDisplayMediaGate({ isAppOrigin: (origin) => isAppOrigin(origin, devServerOrigin) });
  return gate;
}

export function registerCaptureHandlers(getMainWindow: () => BrowserWindow | null): void {
  const electron = electronCapturePort(
    {
      platform: process.platform,
      desktopCapturer,
      systemPreferences,
      screen,
      globalShortcut,
      clipboard,
      nativeImage,
      shell,
    } as unknown as CaptureElectronModules,
    {
      windows: () => BrowserWindow.getAllWindows(),
      focusApp: () => {
        const win = getMainWindow();
        if (!win || win.isDestroyed()) return;
        if (win.isMinimized()) win.restore();
        win.show();
        app.focus({ steal: true });
        win.focus();
      },
    },
  );

  service = createCaptureService({
    dataDir: join(app.getPath('userData'), CAPTURE_DATA_DIR),
    electron,
    defaults: CAPTURE_DEFAULT_SETTINGS,
    emit: captureEmitter(broadcastToAllWindows),
    trashItem: (path) => shell.trashItem(path),
    gate,
    destinations: ['chat'],
    creator: {
      importImage: async ({ repoId, project, fileName, bytes }) => {
        // `writeBytes` creates the project folder on the way down, inside the media store's jail.
        const written = await mediaStore.writeBytes({
          repoId,
          tab: 'image',
          project,
          path: fileName,
          data: Buffer.from(bytes),
        });
        return written.ok ? ok({ project, path: fileName }) : failure(written.kind === 'error' ? written.message : 'Could not import it.');
      },
    },
    background: { shortcut: true, clipboard: true },
  });
  setCaptureFileResolver(service.fileResolver);

  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: broadcastToAllWindows,
    trashItem: (path) => shell.trashItem(path),
  };
  captureMain.register(ctx, { capture: service });
  void service.start();
}

/** Releases the chord, stops clipboard polling and drops an unfinished recording — on quit. */
export function disposeCapture(): void {
  const current = service;
  service = null;
  if (current) void current.dispose();
}
