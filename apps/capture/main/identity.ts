import { join } from 'node:path';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

/** The identity the launcher's stub stamps (`apps/launcher/src/main/bundles/layout.ts`). */
export const CAPTURE_NAME = 'Midnite Capture';
export const CAPTURE_BUNDLE_ID = 'io.bilo.midnite-capture';

/** Env a headless proof sets: where userData goes, and "quit after the window is ready". */
export const SMOKE_ENV = 'MIDNITE_CAPTURE_SMOKE';
export const USER_DATA_ENV = 'MIDNITE_CAPTURE_USER_DATA';
/** What a smoke run prints once the window has loaded `index.html`. */
export const SMOKE_READY_LINE = 'midnite-capture:ready';

/**
 * The chord Midnite Capture ships with — the standalone app is the one a user installs *for* the
 * shortcut. Studio ships none. It is registered only while the app runs, and the user can change or
 * remove it in Capture's settings; a chord another app holds is reported, never fought over.
 */
export const CAPTURE_APP_SHORTCUT = 'CommandOrControl+Shift+2';

/**
 * Capture's own userData: `<appData>/Midnite Runtime/apps/capture`, under the runtime's data directory
 * rather than a per-app name beside it. `override` is for a throwaway run, never a default.
 */
export function captureUserData(appData: string, override?: string): string {
  if (override !== undefined && override !== '') return override;
  return join(runtimeDataDirectory(appData), 'apps', 'capture');
}

export const isSmoke = (env: NodeJS.ProcessEnv): boolean => env[SMOKE_ENV] === '1';
