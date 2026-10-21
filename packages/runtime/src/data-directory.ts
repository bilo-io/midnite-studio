import { join } from 'node:path';

/**
 * The runtime's data directory name, the one place it is written down
 * (Phase 113 Theme G).
 *
 * The runtime is a launcher-hosted process (Decision 10), not any one app, so
 * its state does not belong under an app's own name. On macOS an Electron
 * app's `userData` is `~/Library/Application Support/<name>`; the conventional
 * home for the shared process is the sibling `Midnite Runtime`. The base is
 * injected (`app.getPath('appData')` in the composition, a temp dir in tests),
 * so nothing here ever resolves a real home directory.
 */
export const RUNTIME_DATA_DIRECTORY_NAME = 'Midnite Runtime';

/** `<appData>/Midnite Runtime`. */
export function runtimeDataDirectory(appDataBase: string): string {
  return join(appDataBase, RUNTIME_DATA_DIRECTORY_NAME);
}

/**
 * `<appData>/Midnite Runtime/apps/<appId>` — one app's own data directory. The single definition:
 * the app that owns it (`apps/mind`'s userData) and any other process that must write into it (Studio's
 * quick capture into Mind's notebook) both come here, so the two cannot name different folders.
 */
export function appDataDirectory(appDataBase: string, appId: string): string {
  return join(runtimeDataDirectory(appDataBase), 'apps', appId);
}
