import { join } from 'node:path';

import {
  CHANNELS,
  EVENT_CHANNELS,
  resolveSuitePrefs,
  SuitePrefsSetRequestSchema,
  WindowSetBackgroundRequest,
  type SuiteLinkLanding,
  type SuitePrefsSnapshot,
} from '@midnite/studio-shared';

import { runtimeDataDirectory } from '../data-directory';
import { createSuitePrefsService, type SuitePrefsService } from '../suite-prefs';
import { landingFromArgv } from './suite-link';
import { attachWindowChrome, toggleMaximize, type ChromeableWindow } from './suite-window';

/** The window an app's main hands over: chrome events plus the one setter the theme retint needs. */
export type SuiteMainWindow = ChromeableWindow & { setBackgroundColor(color: string): void };

export type SuiteMainElectron = {
  ipcMain: {
    handle(channel: string, listener: (event: unknown, raw: unknown) => unknown): void;
    on(channel: string, listener: (event: unknown, raw: unknown) => void): void;
  };
};

export type SuiteMainOptions = SuiteMainElectron & {
  /** `<appData>/Midnite Runtime`, or `<override>/runtime` for a throwaway run — where `suite-prefs.json` lives. */
  runtimeDirectory: string;
  /** The app's one window, or null before it exists / after it closes. */
  getWindow: () => SuiteMainWindow | null;
  warn: (message: string) => void;
  /** `process.argv` of this launch: a `--midnite-link=` on it is where the host first lands. */
  argv?: readonly string[];
};

export type SuiteMain = {
  service: SuitePrefsService;
  /** Forward fullscreen/focus/maximize transitions of the window just created. */
  attachWindow(win: SuiteMainWindow): void;
  /**
   * A launcher link reached the running host (`second-instance`'s argv): pushed to the window, or kept
   * for the renderer's `take` when there is none yet. An argv with no valid link is ignored.
   */
  handleArgv(argv: readonly string[]): void;
  close(): void;
};

/**
 * What every suite app's main registers for the shell's two bridge slices (Phase 123 Theme H):
 * `suitePrefs` (get / set / changed over the shared file, watched so another app's write arrives) and
 * the `windowChrome` channels (maximise toggle, window-backing retint). Studio's main wires the same
 * channels through its own `window-chrome.ts` / `suite-prefs-handlers.ts`; this is the runtime-only
 * form for apps that have no desktop package. Reads never throw into the renderer's boot.
 */
export function registerSuiteMain(options: SuiteMainOptions): SuiteMain {
  const { ipcMain, getWindow, warn } = options;
  const service = createSuitePrefsService({ directory: options.runtimeDirectory, warn });
  service.onChanged((snapshot: SuitePrefsSnapshot) => {
    const win = getWindow();
    if (win !== null && !win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.suitePrefsChanged, snapshot);
  });
  service.watch();

  ipcMain.handle(CHANNELS.suitePrefsGet, async () => {
    try {
      return await service.get();
    } catch (err) {
      warn(`suite-prefs: read failed (${String(err)}); answering defaults`);
      return resolveSuitePrefs({});
    }
  });
  ipcMain.handle(CHANNELS.suitePrefsSet, async (_event, raw) => {
    const parsed = SuitePrefsSetRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false as const, error: `${CHANNELS.suitePrefsSet}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}` };
    }
    return service.set(parsed.data);
  });

  // A landing the renderer has not taken yet: the cold start's argv, or a link that beat the window.
  let pending: SuiteLinkLanding | null = landingFromArgv(options.argv ?? []);
  // Once the renderer has asked, it is mounted and listening: a later link is pushed rather than parked.
  let rendererReady = false;
  ipcMain.handle(CHANNELS.suiteLinkTake, () => {
    rendererReady = true;
    const landing = pending;
    pending = null;
    return landing;
  });
  const handleArgv = (argv: readonly string[]): void => {
    const landing = landingFromArgv(argv);
    if (landing === null) return;
    const win = getWindow();
    if (rendererReady && win !== null && !win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.suiteLinkOpen, landing);
    else pending = landing;
  };

  ipcMain.on(CHANNELS.windowMaximizeToggle, () => {
    const win = getWindow();
    if (win !== null) toggleMaximize(win);
  });
  ipcMain.on(CHANNELS.windowSetBackground, (_event, raw) => {
    const color = WindowSetBackgroundRequest.safeParse(raw);
    const win = getWindow();
    if (color.success && win !== null && !win.isDestroyed()) win.setBackgroundColor(color.data);
  });

  return {
    service,
    attachWindow: (win) => attachWindowChrome(win),
    handleArgv,
    close: () => service.close(),
  };
}

/**
 * Where an app finds the shared suite-prefs file: the runtime's data directory, or `<override>/runtime`
 * for a throwaway run (the app's `MIDNITE_<APP>_USER_DATA`), so a proof never touches a real profile.
 */
export function suiteRuntimeDirectory(appData: string, userDataOverride?: string): string {
  if (userDataOverride !== undefined && userDataOverride !== '') return join(userDataOverride, 'runtime');
  return runtimeDataDirectory(appData);
}
