import { join } from 'node:path';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

/** The identity the launcher's stub stamps (`apps/launcher/src/main/bundles/layout.ts`). */
export const BROWSER_NAME = 'Midnite Browser';
export const BROWSER_BUNDLE_ID = 'io.bilo.midnite-browser';

/** Env a headless proof sets: where userData goes, and "quit after the window is ready". */
export const SMOKE_ENV = 'MIDNITE_BROWSER_SMOKE';
export const USER_DATA_ENV = 'MIDNITE_BROWSER_USER_DATA';
/** What a smoke run prints once the window has loaded `index.html`. */
export const SMOKE_READY_LINE = 'midnite-browser:ready';

/**
 * Browser's own userData: `<appData>/Midnite Runtime/apps/browser`, under the runtime's data directory
 * rather than a per-app name beside it. Its `persist:browser` and `persist:app-<id>` partitions — the
 * cookies and logins of every page it shows — live under it, apart from Studio's own. `override` is for a
 * throwaway run, never a default.
 */
export function browserUserData(appData: string, override?: string): string {
  if (override !== undefined && override !== '') return override;
  return join(runtimeDataDirectory(appData), 'apps', 'browser');
}

export const isSmoke = (env: NodeJS.ProcessEnv): boolean => env[SMOKE_ENV] === '1';
