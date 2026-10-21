import { join } from 'node:path';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

/** The identity the launcher's stub stamps (`apps/launcher/src/main/bundles/layout.ts`). */
export const MEDIA_NAME = 'Midnite Media';
export const MEDIA_BUNDLE_ID = 'io.bilo.midnite-media';

/** Env a headless proof sets: where userData goes, and "quit after the window is ready". */
export const SMOKE_ENV = 'MIDNITE_MEDIA_SMOKE';
export const USER_DATA_ENV = 'MIDNITE_MEDIA_USER_DATA';
/** What a smoke run prints once the window has loaded `index.html`. */
export const SMOKE_READY_LINE = 'midnite-media:ready';

/**
 * Media's own userData: `<appData>/Midnite Runtime/apps/media`, under the runtime's data directory
 * rather than a per-app name beside it. `override` is for a throwaway run, never a default.
 */
export function mediaUserData(appData: string, override?: string): string {
  if (override !== undefined && override !== '') return override;
  return join(runtimeDataDirectory(appData), 'apps', 'media');
}

/**
 * Where the runtime host's vault socket is looked for. A throwaway run keeps even that path inside its
 * own directory, so it never reaches a running Studio's vault.
 */
export function mediaVaultDirectory(appData: string, override?: string): string {
  if (override !== undefined && override !== '') return join(override, 'runtime');
  return runtimeDataDirectory(appData);
}

export const isSmoke = (env: NodeJS.ProcessEnv): boolean => env[SMOKE_ENV] === '1';
