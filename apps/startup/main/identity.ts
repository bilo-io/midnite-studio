import { appDataDirectory } from '@midnite/studio-runtime';

/** The identity the launcher's stub stamps (`apps/launcher/src/main/bundles/layout.ts`). */
export const STARTUP_NAME = 'Midnite Startup';
export const STARTUP_BUNDLE_ID = 'io.bilo.midnite-startup';

/** Env a headless proof sets: where userData goes, and "quit after the window is ready". */
export const SMOKE_ENV = 'MIDNITE_STARTUP_SMOKE';
export const USER_DATA_ENV = 'MIDNITE_STARTUP_USER_DATA';
/** What a smoke run prints once the window has loaded `index.html`. */
export const SMOKE_READY_LINE = 'midnite-startup:ready';

/**
 * Startup's own userData: `<appData>/Midnite Runtime/apps/startup`, under the runtime's data
 * directory rather than a per-app name beside it. `override` is for a throwaway run, never a default.
 */
export function startupUserData(appData: string, override?: string): string {
  if (override !== undefined && override !== '') return override;
  return appDataDirectory(appData, 'startup');
}

export const isSmoke = (env: NodeJS.ProcessEnv): boolean => env[SMOKE_ENV] === '1';
