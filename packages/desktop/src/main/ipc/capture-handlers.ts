import { join } from 'node:path';

import {
  CAPTURE_DATA_DIR,
  captureEmitter,
  captureMain,
  createCaptureService,
  createDisplayMediaGate,
  electronCapturePort,
  electronOverlayOpener,
  type CaptureElectronModules,
  type CaptureOverlayBrowserWindow,
  type CaptureService,
  type DisplayMediaGate,
} from '@midnite/studio-feature-capture/main';
import { isAppOrigin } from '@midnite/studio-feature-browser/main';
import { appDataDirectory, guardAppWindow, type FeatureMainContext } from '@midnite/studio-runtime';
import { CAPTURE_DEFAULT_SETTINGS, CAPTURE_OVERLAY_ARG, failure, ok } from '@midnite/studio-shared';
import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
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
 * - Send to: `chat` (the renderer's chats slot), `pr-comment` (the renderer puts the screenshot on the
 *   clipboard and opens the PR's page in the embedded browser — the user pastes and comments there) and
 *   `creator` (the bytes written into the selected repo's Creator ▸ Images ▸ Captures through the media
 *   store). Nothing is posted or uploaded anywhere.
 * - The desktop region overlay (slice 2): {@link openOverlayWindow} — one frameless, transparent,
 *   always-on-top window over the display under the pointer, sandboxed, guarded, loading only the page
 *   bundled beside `main.js`, with a preload that exposes the three overlay calls and nothing else.
 * - Import (slice 2): a `midnite-studio://capture?id=` link from the standalone Midnite Capture lands on
 *   `capture.importFromApp`, which copies that one capture out of Midnite Capture's own data directory
 *   (read only) after the renderer's confirm.
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

/**
 * The overlay window, built by the composer so the feature imports no `electron`: `new BrowserWindow`,
 * then the same navigation guard every suite app window has — no `window.open`, no navigating off the
 * page, and no hand-off at all (the overlay has no link to follow).
 */
function openOverlayWindow(options: Record<string, unknown>): CaptureOverlayBrowserWindow {
  const overlay = new BrowserWindow(options as ConstructorParameters<typeof BrowserWindow>[0]);
  guardAppWindow(overlay.webContents, { openExternal: () => undefined });
  return overlay;
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
      ClipboardItem,
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
    destinations: ['chat', 'pr-comment'],
    overlay: electronOverlayOpener({
      createWindow: openOverlayWindow,
      htmlPath: join(__dirname, 'capture-overlay.html'),
      preloadPath: join(__dirname, 'capture-overlay-preload.js'),
      tokenArg: CAPTURE_OVERLAY_ARG,
    }),
    // Midnite Capture's own data directory — the one `apps/capture` keeps its captures in.
    importFrom: {
      dataDir: join(appDataDirectory(app.getPath('appData'), 'capture'), CAPTURE_DATA_DIR),
    },
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
