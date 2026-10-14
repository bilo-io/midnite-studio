import { join } from 'node:path';

import { VAULT_NAMESPACES, type VaultClient } from '@midnite/studio-runtime';
import type { SecretKey } from '@midnite/studio-shared';

/**
 * App-wide secrets (Phase 76 Theme D) — since Phase 113 Theme D a binding
 * over the runtime vault's `secrets` namespace, made as whichever app holds
 * the {@link VaultClient}. Same file, same entries, same behaviour: a `set`
 * with no working keychain is dropped.
 */
const FILE_NAME = VAULT_NAMESPACES.secrets.fileName;
const NS = 'secrets';

export type SecretsVault = {
  isAvailable: () => boolean;
  get: (key: SecretKey) => Promise<string | null>;
  set: (key: SecretKey, value: string) => Promise<void>;
  delete: (key: SecretKey) => Promise<void>;
};

export function createSecretsVault(vault: VaultClient): SecretsVault {
  return {
    isAvailable: () => vault.isAvailable(),
    get: (key) => vault.get(NS, key),
    set: (key, value) => vault.set(NS, key, value),
    delete: (key) => vault.delete(NS, key),
  };
}

/** Resolve the on-disk path — tests assert mode without reaching into the vault. */
export function secretsVaultPath(directory: string): string {
  return join(directory, FILE_NAME);
}

export const nullSecretsVault: SecretsVault = {
  isAvailable: () => false,
  get: async () => null,
  set: async () => {},
  delete: async () => {},
};
