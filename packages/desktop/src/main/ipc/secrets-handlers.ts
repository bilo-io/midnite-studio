import { CHANNELS, schemas } from '@midnite/studio-shared';

import type { SecretsVault } from '../secrets-vault';
import { handle } from './handle';

let vault: SecretsVault | null = null;

export function configureSecrets(next: SecretsVault): void {
  vault = next;
}

async function readTwelveDataKey(): Promise<string | null> {
  if (!vault) return null;
  return vault.get('finance.twelveData');
}

/** Exposed for finance handlers — the key never crosses back to the renderer. */
export { readTwelveDataKey };

export function registerSecretsHandlers(): void {
  handle(
    CHANNELS.secretsGet,
    schemas.SecretsGetRequest,
    async ({ key }) => {
      if (!vault) return { value: null };
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
}
