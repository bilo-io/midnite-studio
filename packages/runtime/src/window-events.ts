import type { BrowserWindow } from 'electron';

/**
 * Send `payload` on `channel` to whatever window `getWindow` resolves, or do
 * nothing when there is none or it is mid-teardown.
 *
 * Every progress stream in main (`optimizerScanProgress`, the system-cache
 * scan, …) repeated these three lines; it is the first piece of window
 * plumbing the runtime owns, and what a composer hands a feature as
 * `FeatureMainContext.emit`.
 */
export function sendToLiveWindow(
  getWindow: () => BrowserWindow | null,
  channel: string,
  payload: unknown,
): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
