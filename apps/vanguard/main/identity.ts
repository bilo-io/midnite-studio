import { join } from 'node:path';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

/** The identity the launcher's stub stamps (`apps/launcher/src/main/bundles/layout.ts`). */
export const VANGUARD_NAME = 'Midnite Vanguard';
export const VANGUARD_BUNDLE_ID = 'io.bilo.midnite-vanguard';

/** Env a headless proof sets: where userData goes, and "quit after the window is ready". */
export const SMOKE_ENV = 'MIDNITE_VANGUARD_SMOKE';
export const USER_DATA_ENV = 'MIDNITE_VANGUARD_USER_DATA';
/** What a smoke run prints once the window has loaded `index.html`. */
export const SMOKE_READY_LINE = 'midnite-vanguard:ready';

/**
 * Vanguard's own userData: `<appData>/Midnite Runtime/apps/vanguard`, under the runtime's data
 * directory rather than a per-app name beside it. `override` is for a throwaway run, never a default.
 */
export function vanguardUserData(appData: string, override?: string): string {
  if (override !== undefined && override !== '') return override;
  return join(runtimeDataDirectory(appData), 'apps', 'vanguard');
}

/**
 * Where Vanguard finds the runtime host's record (and through it the shared broker): the runtime's
 * data directory, or `<override>/runtime` for a throwaway run, so a proof never reaches a real one.
 */
export function vanguardRuntimeDirectory(appData: string, override?: string): string {
  if (override !== undefined && override !== '') return join(override, 'runtime');
  return runtimeDataDirectory(appData);
}

export const isSmoke = (env: NodeJS.ProcessEnv): boolean => env[SMOKE_ENV] === '1';
