import { join } from 'node:path';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

/** The identity the launcher's stub stamps (`apps/launcher/src/main/bundles/layout.ts`). */
export const HEALTH_NAME = 'Midnite Health';
export const HEALTH_BUNDLE_ID = 'io.bilo.midnite-health';

/** Env a headless proof sets: where userData goes, and "quit after the window is ready". */
export const SMOKE_ENV = 'MIDNITE_HEALTH_SMOKE';
export const USER_DATA_ENV = 'MIDNITE_HEALTH_USER_DATA';
/** What a smoke run prints once the window has loaded `index.html`. */
export const SMOKE_READY_LINE = 'midnite-health:ready';

/**
 * Health's own userData: `<appData>/Midnite Runtime/apps/health`, under the runtime's data
 * directory. `override` is for a throwaway run, never a default. Health reads no secret, so it has
 * no vault directory or pairing.
 */
export function healthUserData(appData: string, override?: string): string {
  if (override !== undefined && override !== '') return override;
  return join(runtimeDataDirectory(appData), 'apps', 'health');
}

export const isSmoke = (env: NodeJS.ProcessEnv): boolean => env[SMOKE_ENV] === '1';
