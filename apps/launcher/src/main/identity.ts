import { join } from 'node:path';

/** What the launcher calls itself, in the Dock and the menu bar. */
export const LAUNCHER_NAME = 'Midnite Apps';

type IdentityApp = {
  isPackaged: boolean;
  setName: (name: string) => void;
  dock?: { setIcon: (path: string) => void };
};

/**
 * The launcher's own Dock name and icon in `moon run launcher:start`.
 *
 * A packaged build gets both from electron-builder (`productName`, `icon.icns`).
 * Run from source, the process is the stock Electron binary, so without this the
 * Dock shows "Electron" and Electron's atom. Packaged builds are left alone.
 * The icon is `launcher.png`, the master `icon.icns` is generated from — Electron's
 * `dock.setIcon` cannot decode that icns ("Failed to load image"), a PNG it can.
 * `bundleDir` is the folder holding `main.cjs`; `resources/` sits beside it.
 */
export function applyDevIdentity(app: IdentityApp, bundleDir: string): boolean {
  if (app.isPackaged) return false;
  app.setName(LAUNCHER_NAME);
  app.dock?.setIcon(join(bundleDir, '..', 'resources', 'app-logos', 'launcher.png'));
  return true;
}
