/**
 * Where Midnite Apps keeps its data: `<appData>/<name>` (`~/Library/Application Support/…`).
 *
 * The launcher pins its Electron `userData` to this rather than taking Electron's default,
 * which is the package.json `name` (`@midnite/launcher`), and the runtime reads the
 * launcher's `bundles/installed.json` from the same place — one name both sides import, so
 * they cannot drift apart again. A run from source gets its own directory so it never shares
 * the installed launcher's data or its single-instance lock.
 *
 * Plain constants and no imports: the launcher takes this file by source path.
 */
export const LAUNCHER_DATA_DIR_NAME = 'Midnite Apps';

/** `moon run launcher:start` — a dev launcher cannot manage bundles, and must not touch a real install's. */
export const LAUNCHER_DEV_DATA_DIR_NAME = 'Midnite Apps Dev';

/** The data directory's name for a packaged (`true`) or from-source (`false`) launcher. */
export function launcherDataDirName(isPackaged: boolean): string {
  return isPackaged ? LAUNCHER_DATA_DIR_NAME : LAUNCHER_DEV_DATA_DIR_NAME;
}
