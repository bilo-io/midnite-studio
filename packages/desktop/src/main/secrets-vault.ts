import { join } from 'node:path';

import type { SecretKey } from '@midnite/studio-shared';

import {
  createSecureJsonStore,
  decryptSecret,
  encryptSecret,
  isSafeStorageAvailable,
} from './secure-store';

const FILE_NAME = 'secrets.vault.json';

type VaultEntry = { encrypted: string };

export type SecretsVault = {
  isAvailable: () => boolean;
  get: (key: SecretKey) => Promise<string | null>;
  set: (key: SecretKey, value: string) => Promise<void>;
  delete: (key: SecretKey) => Promise<void>;
};

function parseVaultState(value: unknown): Record<string, VaultEntry> {
  if (typeof value !== 'object' || value === null) return {};
  const entries = (value as { entries?: unknown }).entries;
  if (typeof entries !== 'object' || entries === null) return {};

  const out: Record<string, VaultEntry> = {};
  for (const [id, raw] of Object.entries(entries as Record<string, unknown>)) {
    if (!id || typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;
    if (typeof row['encrypted'] === 'string') {
      out[id] = { encrypted: row['encrypted'] };
    }
  }
  return out;
}

export function createSecretsVault(directory: string): SecretsVault {
  const store = createSecureJsonStore<VaultEntry>(directory, FILE_NAME, parseVaultState);

  return {
    isAvailable: isSafeStorageAvailable,

    get: async (key) => {
      const entry = await store.get(key);
      if (!entry) return null;
      return decryptSecret(entry.encrypted);
    },

    set: async (key, value) => {
      if (!isSafeStorageAvailable()) return;
      await store.set(key, { encrypted: encryptSecret(value) });
    },

    delete: async (key) => {
      await store.delete(key);
    },
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
