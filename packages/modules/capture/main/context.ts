import { reportMain, type ReportMainServices } from '@midnite/studio-feature-report/main';
import { join } from 'node:path';

import {
  CAPTURE_DATA_DIR,
  captureEmitter,
  createCaptureService,
  type CaptureElectron,
  type CaptureOverlayOpener,
  type CaptureService,
  type DisplayMediaGate,
  type Timers,
} from '@midnite/studio-feature-capture/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';
import { CAPTURE_DEFAULT_SETTINGS } from '@midnite/studio-shared';

import { CAPTURE_APP_SHORTCUT, captureModuleMain } from './module';

/** The electron pieces Capture's main needs, injected so registration is testable under bare vitest. */
export type CaptureServiceElectron = Pick<IpcContextElectron, 'trashItem' | 'send'> & {
  /** `<userData>/capture` — a temp dir under test. */
  dataDir: string;
  /** The real Electron port in the app (`electronCapturePort`), fakes under test. */
  electron: CaptureElectron;
  /** The recording gate installed on the window's session; null, recording is not offered. */
  gate: DisplayMediaGate | null;
  /**
   * False in a smoke run: no system-wide chord is taken and the clipboard is never polled, whatever the
   * saved settings say.
   */
  background: boolean;
  /** The desktop region overlay's opener (`electronOverlayOpener`); absent, regions are picked in-window. */
  overlay?: CaptureOverlayOpener;
  /**
   * Opens a `midnite-studio://capture?id=` link — `shell.openExternal` in the app. Main builds the link
   * from a stored capture's id; the renderer never hands it a URL.
   */
  openStudioLink?: (url: string) => Promise<void>;
  /** The chord the app ships with; absent, none (a host that mounts Capture beside other modules takes none). */
  shortcut?: string;
  now?: () => number;
  timers?: Timers;
};

export type CaptureAppElectron = IpcContextElectron &
  Omit<CaptureServiceElectron, 'shortcut'> & {
    /** Report an Issue's services — the crash log sink, home dir, and the three OS calls the dialog needs. */
    report: ReportMainServices;
  };

/**
 * Registers every channel Capture's renderer can call and returns the service, which the
 * `mstudio-file://capture/…` handler resolves through. Midnite Capture reaches no other feature, so its
 * Send to… offers only what it can do itself (slice 2): copy to the clipboard, show in Finder, and —
 * when the composer passes {@link CaptureAppElectron.openStudioLink} — open the capture in Midnite Studio
 * through a `midnite-studio://capture` link, which Studio confirms before importing. No chat, no PR
 * comment, no Creator here, and nothing leaves the machine. It ships one default chord
 * ({@link CAPTURE_APP_SHORTCUT}); history stays off until the user switches it on.
 */
export function registerCaptureAppHandlers(el: CaptureAppElectron): CaptureService {
  const ctx = createIpcContext(el);
  reportMain.register(ctx, el.report);
  const capture = createCaptureAppService({ ...el, shortcut: CAPTURE_APP_SHORTCUT });
  captureModuleMain.register(ctx, { capture });
  return capture;
}

/**
 * Builds Capture's service: clipboard and Finder destinations only, and the chord in
 * {@link CaptureServiceElectron.shortcut} (none by default). The host registers the channels —
 * `captureModuleMain` on its own context, or `registerCaptureAppHandlers` for the standalone app.
 */
export function createCaptureAppService(el: CaptureServiceElectron): CaptureService {
  return createCaptureService({
    dataDir: el.dataDir,
    electron: el.electron,
    defaults: { ...CAPTURE_DEFAULT_SETTINGS, ...(el.shortcut ? { shortcut: el.shortcut } : {}) },
    emit: captureEmitter(el.send),
    trashItem: el.trashItem,
    gate: el.gate,
    destinations: ['clipboard', 'finder'],
    ...(el.overlay ? { overlay: el.overlay } : {}),
    ...(el.openStudioLink ? { openStudioLink: el.openStudioLink } : {}),
    background: { shortcut: el.background, clipboard: el.background },
    ...(el.now ? { now: el.now } : {}),
    ...(el.timers ? { timers: el.timers } : {}),
  });
}

/** `<userData>/capture` — Capture's own data directory. */
export const captureDataDir = (userData: string): string => join(userData, CAPTURE_DATA_DIR);
