import { join } from 'node:path';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

/** The identity the launcher's stub stamps (`apps/launcher/src/main/bundles/layout.ts`). */
export const VAULT_NAME = 'Midnite Vault';
export const VAULT_BUNDLE_ID = 'io.bilo.midnite-vault';

/** Env a headless proof sets: where userData goes, and "quit after the window is ready". */
export const SMOKE_ENV = 'MIDNITE_VAULT_SMOKE';
export const USER_DATA_ENV = 'MIDNITE_VAULT_USER_DATA';
/** What a smoke run prints once the window has loaded `index.html`. */
export const SMOKE_READY_LINE = 'midnite-vault:ready';

const has = (override: string | undefined): override is string => override !== undefined && override !== '';

/**
 * Vault's own userData: `<appData>/Midnite Runtime/apps/vault`, under the runtime's data directory
 * rather than a per-app name beside it. `override` is for a throwaway run, never a default.
 */
export function vaultUserData(appData: string, override?: string): string {
  if (has(override)) return override;
  return join(runtimeDataDirectory(appData), 'apps', 'vault');
}

/**
 * Where the vault's namespace files live: the runtime's data directory (the one Theme G's migration
 * fills), never Studio's. A throwaway run keeps it inside its own override directory, so a proof can
 * never reach a real profile.
 */
export function vaultDirectory(appData: string, override?: string): string {
  if (has(override)) return join(override, 'runtime');
  return runtimeDataDirectory(appData);
}

export const isSmoke = (env: NodeJS.ProcessEnv): boolean => env[SMOKE_ENV] === '1';
