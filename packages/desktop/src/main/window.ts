import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { BrowserWindow, app, shell } from 'electron';

import { WINDOW_FRAMELESS_ARG } from '@midnite-git/shared';

import { maybeCapture } from './capture';
import { attachWindowChrome, windowFrameless } from './window-chrome';

/** Vite's dev server, matching `strictPort: true` in packages/app/vite.config.ts. */
const DEV_SERVER_URL = process.env['MGIT_RENDERER_URL'] ?? 'http://localhost:5173';

/**
 * Where the built renderer lives.
 *
 * Packaged: electron-builder copies the Vite output to `Resources/renderer`.
 * Unpackaged: `packages/app/dist`, four levels up from `dist/main/`. The
 * unpackaged branch is what makes `electron .` work against a production build
 * without packaging first — useful for reproducing a bug that only appears when
 * the renderer is loaded over `file://` rather than from the dev server.
 */
function rendererEntry(): string {
  const packaged = join(process.resourcesPath, 'renderer', 'index.html');
  if (app.isPackaged || existsSync(packaged)) return packaged;
  return join(__dirname, '..', '..', '..', 'app', 'dist', 'index.html');
}

/**
 * Background colour painted before the renderer's first frame.
 *
 * Deliberately the dark token's value: the renderer's pre-paint theme script
 * decides light or dark, but until it runs the window shows this. Defaulting to
 * white flashes a white rectangle on every launch for dark-theme users, which
 * is the single most noticeable rough edge in a desktop app. The renderer
 * corrects it through `window:set-background` once the theme resolves.
 */
const INITIAL_BACKGROUND = '#09090b';

export function createWindow(): BrowserWindow {
  const frameless = windowFrameless();

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: INITIAL_BACKGROUND,
    // macOS: drop the native bar and inset the traffic lights so the app-drawn
    // <TitleBar> can host them. `trafficLightPosition` y is tuned against the
    // bar's 48px height (TITLE_BAR_HEIGHT in @bilo-io/shell).
    ...(frameless
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 16, y: 16 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload requires `@midnite-git/shared` for the channel constants,
      // which a sandboxed preload cannot do (it only gets a polyfilled subset of
      // require). contextIsolation + nodeIntegration:false remain the actual
      // security boundary, and the renderer only ever loads local content.
      sandbox: false,
      // Single-sourced from the window options above so the preload never
      // re-derives it. See WINDOW_FRAMELESS_ARG.
      additionalArguments: [`${WINDOW_FRAMELESS_ARG}${frameless ? '1' : '0'}`],
    },
  });

  attachWindowChrome(win);
  maybeCapture(win);

  // Show only once the renderer has painted — otherwise the window appears as
  // an empty rectangle for as long as the bundle takes to boot.
  win.once('ready-to-show', () => win.show());

  // External links open in the user's browser, never in an app window with no
  // chrome to escape from.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  void loadRenderer(win);
  return win;
}

async function loadRenderer(win: BrowserWindow): Promise<void> {
  if (!app.isPackaged && process.env['MGIT_USE_BUILT_RENDERER'] !== '1') {
    await win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
    return;
  }
  await win.loadFile(rendererEntry());
}
