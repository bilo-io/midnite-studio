import { join } from 'node:path';

import { VAULT_NAMESPACES, type VaultClient } from '@midnite/studio-runtime';
import type { SecretKey } from '@midnite/studio-shared';

/**
 * App-wide secrets (Phase 76 Theme D) — since Phase 113 Theme D a binding
 * over the runtime vault's `secrets` namespace, made as whichever app holds
 * the {@link VaultClient}. Same file, same entries. A `set`
 * with no working keychain is held for the session (Phase 115 Theme D), never written.
 */
const FILE_NAME = VAULT_NAMESPACES.secrets.fileName;
const NS = 'secrets';

export type SecretsVault = {
  isAvailable: () => boolean;
  get: (key: SecretKey) => Promise<string | null>;
  set: (key: SecretKey, value: string) => Promise<void>;
  delete: (key: SecretKey) => Promise<void>;
  /**
   * Free-named entries for main-only credentials (Phase 113 Theme P slice 2: a brokerage account's
   * `finance.account.<connector>.<id>.<field>`). Not a `SecretKey`, so no channel can ask for one —
   * `SecretsGetRequest` is an enum — and only main code holding this vault can.
   */
  getEntry: (name: string) => Promise<string | null>;
  setEntry: (name: string, value: string) => Promise<void>;
  deleteEntry: (name: string) => Promise<void>;
};

export function createSecretsVault(vault: VaultClient): SecretsVault {
  return {
    isAvailable: () => vault.isAvailable(),
    get: (key) => vault.get(NS, key),
    set: (key, value) => vault.set(NS, key, value),
    delete: (key) => vault.delete(NS, key),
    getEntry: (name) => vault.get(NS, name),
    setEntry: (name, value) => vault.set(NS, name, value),
    deleteEntry: (name) => vault.delete(NS, name),
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
  getEntry: async () => null,
  setEntry: async () => {},
  deleteEntry: async () => {},
};
