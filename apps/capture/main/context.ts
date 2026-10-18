import { join } from 'node:path';

import {
  CAPTURE_DATA_DIR,
  captureEmitter,
  captureMain,
  createCaptureService,
  type CaptureElectron,
  type CaptureService,
  type DisplayMediaGate,
  type Timers,
} from '@midnite/studio-feature-capture/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';
import { CAPTURE_DEFAULT_SETTINGS } from '@midnite/studio-shared';

import { CAPTURE_APP_SHORTCUT } from './identity';

/** The electron pieces Capture's main needs, injected so registration is testable under bare vitest. */
export type CaptureAppElectron = IpcContextElectron & {
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
  now?: () => number;
  timers?: Timers;
};

/**
 * Registers every channel Capture's renderer can call and returns the service, which the
 * `mstudio-file://capture/…` handler resolves through. Midnite Capture reaches no other feature, so it
 * offers no Send to… destination: no chat, no PR comment, no Creator — the capture stays on this machine
 * until the user copies or reveals it. It ships one default chord ({@link CAPTURE_APP_SHORTCUT}); history
 * stays off until the user switches it on.
 */
export function registerCaptureAppHandlers(el: CaptureAppElectron): CaptureService {
  const ctx = createIpcContext(el);
  const capture = createCaptureService({
    dataDir: el.dataDir,
    electron: el.electron,
    defaults: { ...CAPTURE_DEFAULT_SETTINGS, shortcut: CAPTURE_APP_SHORTCUT },
    emit: captureEmitter(el.send),
    trashItem: el.trashItem,
    gate: el.gate,
    destinations: [],
    background: { shortcut: el.background, clipboard: el.background },
    ...(el.now ? { now: el.now } : {}),
    ...(el.timers ? { timers: el.timers } : {}),
  });
  captureMain.register(ctx, { capture });
  return capture;
}

/** `<userData>/capture` — Capture's own data directory. */
export const captureDataDir = (userData: string): string => join(userData, CAPTURE_DATA_DIR);
