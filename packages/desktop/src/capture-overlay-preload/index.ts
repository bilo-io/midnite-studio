import { contextBridge, ipcRenderer } from 'electron';

import {
  CAPTURE_OVERLAY_ARG,
  CAPTURE_OVERLAY_GLOBAL,
  CHANNELS,
  type CaptureOverlayBridge,
} from '@midnite/studio-shared';

/**
 * The desktop region overlay's preload (Phase 113 Theme K slice 2) — the whole surface the overlay page
 * can see, and deliberately nothing like the app's: three calls, each carrying this overlay's one-time
 * token, on exactly the three overlay channels. No `midniteStudio`, no events, no other channel.
 *
 * The token comes in on `additionalArguments` (main's `overlayWindowOptions`) and stays here: the page
 * never sees it, and main answers the overlay channels only for the overlay open now.
 */
const arg = process.argv.find((a) => a.startsWith(CAPTURE_OVERLAY_ARG));
const token = arg ? arg.slice(CAPTURE_OVERLAY_ARG.length) : '';

const overlay: CaptureOverlayBridge = {
  frame: () => ipcRenderer.invoke(CHANNELS.captureOverlayFrame, { token }),
  confirm: (rect) => ipcRenderer.invoke(CHANNELS.captureOverlayConfirm, { token, rect }),
  cancel: () => ipcRenderer.invoke(CHANNELS.captureOverlayCancel, { token }),
};

try {
  contextBridge.exposeInMainWorld(CAPTURE_OVERLAY_GLOBAL, overlay);
} catch {
  // contextIsolation disabled — the overlay window always has it on, so this is never reached.
}
