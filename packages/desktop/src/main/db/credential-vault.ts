import { join } from 'node:path';

import type { ConnectionConfig } from '@midnite/studio-shared';

import {
  createSecureJsonStore,
  decryptSecret,
  encryptSecret,
  isSafeStorageAvailable,
} from '../secure-store';

/**
 * Where a saved connection's password actually lives — `safeStorage` keyed per
 * connection id, the encrypted blob stored **alongside, not inside**
 * `db-connections.json` (a separate `db-connections.vault.json`).
 *
 * The app secrets vault (`secrets-vault.ts`) uses the same `secure-store`
 * helpers for the Twelve Data key (Phase 76 Theme D).
 *
 * **Degrades rather than blocks** when encryption is unavailable: the
 * connection still saves, and the password is prompted per session instead.
 */
export type CredentialVault = {
  isAvailable: () => boolean;
  get: (id: string) => Promise<string | null>;
  /** Encrypt and store a password, fingerprinted against `config`'s non-secret fields. */
  set: (config: ConnectionConfig, password: string) => Promise<void>;
  delete: (id: string) => Promise<void>;
  /** Drop a stored password if `config`'s fingerprint no longer matches what was saved. */
  reconcile: (config: ConnectionConfig) => Promise<void>;
};

type VaultEntry = { fingerprint: string; encrypted: string };

const FILE_NAME = 'db-connections.vault.json';

/**
 * NUL-joined for the same reason `diagnostics/trust-store.ts`'s
 * `commandFingerprint` is: any printable separator makes two different
 * connections fingerprint alike.
 */
export function connectionFingerprint(config: ConnectionConfig): string {
  return [
    config.provider,
    config.host ?? '',
    config.port ?? '',
    config.database,
    config.username ?? '',
    config.sqlitePath ?? '',
  ].join('\0');
}

function parseVaultState(value: unknown): Record<string, VaultEntry> {
  if (typeof value !== 'object' || value === null) return {};
  const entries = (value as { entries?: unknown }).entries;
  if (typeof entries !== 'object' || entries === null) return {};

  const out: Record<string, VaultEntry> = {};
  for (const [id, raw] of Object.entries(entries as Record<string, unknown>)) {
    if (!id || typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;
    if (typeof row['fingerprint'] === 'string' && typeof row['encrypted'] === 'string') {
      out[id] = { fingerprint: row['fingerprint'], encrypted: row['encrypted'] };
    }
  }
  return out;
}

export function createCredentialVault(directory: string): CredentialVault {
  const store = createSecureJsonStore<VaultEntry>(directory, FILE_NAME, parseVaultState);

  return {
    isAvailable: isSafeStorageAvailable,

    get: async (id) => {
      const entry = await store.get(id);
      if (!entry) return null;
      return decryptSecret(entry.encrypted);
    },

    set: async (config, password) => {
      if (!isSafeStorageAvailable()) return;
      await store.set(config.id, {
        fingerprint: connectionFingerprint(config),
        encrypted: encryptSecret(password),
      });
    },

    delete: async (id) => {
      await store.delete(id);
    },

    reconcile: async (config) => {
      const entry = await store.get(config.id);
      if (entry && entry.fingerprint !== connectionFingerprint(config)) {
        await store.delete(config.id);
      }
    },
  };
}

/** Resolve the on-disk path — tests assert contents without reaching into the vault. */
export function credentialVaultPath(directory: string): string {
  return join(directory, FILE_NAME);
}

/** Stores nothing and remembers nothing — the fallback before one is configured. */
export const nullCredentialVault: CredentialVault = {
  isAvailable: () => false,
  get: async () => null,
  set: async () => {},
  delete: async () => {},
  reconcile: async () => {},
};
