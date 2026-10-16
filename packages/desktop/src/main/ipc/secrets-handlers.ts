import { registerVaultGrantHandlers, type VaultGrants } from '@midnite/studio-runtime';
import { CHANNELS, schemas, type SecretKey } from '@midnite/studio-shared';

import type { SecretsVault } from '../secrets-vault';
import { handle, handleBare, handleSend } from './handle';

let vault: SecretsVault | null = null;

export function configureSecrets(next: SecretsVault): void {
  vault = next;
}

let grants: VaultGrants | null = null;

/** The runtime's per-app grants (Phase 113 Theme J slice 2), configured beside the vault service. */
export function configureVaultGrants(next: VaultGrants): void {
  grants = next;
}

async function readTwelveDataKey(): Promise<string | null> {
  if (!vault) return null;
  return vault.get('finance.twelveData');
}

/** Exposed for finance handlers — the key never crosses back to the renderer. */
export { readTwelveDataKey };

/**
 * Exposed for `ollama-handlers.ts` (the cloud catalogue fetch) and
 * `pty-service.ts`'s `useOllamaKey` marker resolution (Phase 96 Theme F) —
 * the key never crosses back to the renderer either way.
 */
export async function readOllamaApiKey(): Promise<string | null> {
  if (!vault) return null;
  return vault.get('ollama.apiKey');
}

/**
 * Keys that never cross the bridge, whatever asks. `secretsGet` used to hand
 * `finance.twelveData` to Settings so it could tell whether one was set; that
 * is `secretsHas`'s job now (Phase 113 Theme P), and the finance handlers read
 * the key in main. Refusing it here makes "the renderer never receives the
 * market-data key" a property of the channel, not of the callers.
 */
export const MAIN_ONLY_SECRETS: readonly SecretKey[] = ['finance.twelveData'];

export function registerSecretsHandlers(): void {
  registerVaultGrantHandlers({ handle, handleBare, send: handleSend }, () => grants);

  handle(
    CHANNELS.secretsGet,
    schemas.SecretsGetRequest,
    async ({ key }) => {
      if (!vault || MAIN_ONLY_SECRETS.includes(key)) return { value: null };
      return { value: await vault.get(key) };
    },
    () => ({ value: null }),
  );

  handle(
    CHANNELS.secretsSet,
    schemas.SecretsSetRequest,
    async ({ key, value }) => {
      if (!vault) return;
      if (!value.trim()) {
        await vault.delete(key);
        return;
      }
      await vault.set(key, value);
    },
    () => undefined,
  );

  handle(
    CHANNELS.secretsHas,
    schemas.SecretsHasRequest,
    async ({ key }) => {
      if (!vault) return { hasKey: false };
      return { hasKey: (await vault.get(key)) !== null };
    },
    () => ({ hasKey: false }),
  );
}

/**
 * Exposed for `media-image-handlers.ts` (Phase 99 Theme C) — the image
 * adapters' API keys are read here in main and never cross the bridge.
 */
export async function readSecret(key: SecretKey): Promise<string | null> {
  if (!vault) return null;
  return vault.get(key);
}
