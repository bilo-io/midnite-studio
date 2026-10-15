import { join } from 'node:path';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

/** The identity the launcher's stub stamps (`apps/launcher/src/main/bundles/layout.ts`). */
export const CLEANER_NAME = 'Midnite Cleaner';
export const CLEANER_BUNDLE_ID = 'io.bilo.midnite-cleaner';

/** Env a headless proof sets: where userData goes, and "quit after the window is ready". */
export const SMOKE_ENV = 'MIDNITE_CLEANER_SMOKE';
export const USER_DATA_ENV = 'MIDNITE_CLEANER_USER_DATA';
/** What a smoke run prints once the window has loaded `index.html`. */
export const SMOKE_READY_LINE = 'midnite-cleaner:ready';

/**
 * Cleaner's own userData: `<appData>/Midnite Runtime/apps/cleaner`, under the runtime's data
 * directory rather than a per-app name beside it. `override` is for a throwaway run, never a default.
 */
export function cleanerUserData(appData: string, override?: string): string {
  if (override !== undefined && override !== '') return override;
  return join(runtimeDataDirectory(appData), 'apps', 'cleaner');
}

export const isSmoke = (env: NodeJS.ProcessEnv): boolean => env[SMOKE_ENV] === '1';
