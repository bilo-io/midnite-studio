import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { safeStorage } from 'electron';

import type { ConnectionConfig } from '@midnite/studio-shared';

/**
 * Where a saved connection's password actually lives — the one module here
 * importing `electron`: `safeStorage.encryptString`/`decryptString`, keyed
 * per connection id, the encrypted blob stored **alongside, not inside**
 * `db-connections.json` (a separate `db-connections.vault.json`).
 *
 * This is the first real use of `safeStorage` in this repo. It is not the
 * first time the app has handled a secret, though, and it matters which of
 * the two existing ways this fixes: the GitHub token is never stored at all
 * — everything shells out through
 * [`forge/gh-shell.ts`](../forge/gh-shell.ts) — while
 * [`finance-store.ts`](../../../app/src/features/finance/finance-store.ts)
 * persists an API key in **plaintext renderer localStorage**, in a docstring
 * that names `safeStorage` as the thing it deliberately skipped (fetching
 * straight from the renderer rather than proxying through main). This vault
 * is the fix for that pattern, not a claim that nothing here handled a
 * secret before.
 *
 * **Degrades rather than blocks** when `safeStorage.isEncryptionAvailable()`
 * is `false`: the connection still saves, and the password is prompted per
 * session instead of persisted. This is a dev-machine case, not a release
 * blocker — the only ship target is mac arm64, where `safeStorage` backs
 * onto Keychain and is available.
 *
 * **Editing a connection's host/database revokes its stored password**,
 * the same pattern `trust-store.ts` uses for a changed diagnostics command:
 * each entry carries a fingerprint of the connection's non-secret fields, and
 * `reconcile()` drops the stored password the moment that fingerprint stops
 * matching — a connection that now points somewhere else does not silently
 * reuse a secret that was typed in for the old target.
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
type StoredState = { version: 1; entries: Record<string, VaultEntry> };

const FILE_NAME = 'db-connections.vault.json';

/**
 * NUL-joined for the same reason `diagnostics/trust-store.ts`'s
 * `commandFingerprint` is: any printable separator makes two different
 * connections fingerprint alike, and this value decides whether a stored
 * password gets reused.
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

export function createCredentialVault(directory: string): CredentialVault {
  const file = join(directory, FILE_NAME);
  let cache: Record<string, VaultEntry> | null = null;

  const load = async (): Promise<Record<string, VaultEntry>> => {
    if (cache) return cache;
    try {
      cache = parseVaultState(JSON.parse(await readFile(file, 'utf8')));
    } catch {
      cache = {};
    }
    return cache;
  };

  const persist = async (entries: Record<string, VaultEntry>): Promise<void> => {
    const state: StoredState = { version: 1, entries };
    try {
      await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch {
      // A read-only data dir must not take the app down — the password holds
      // for this session and is asked for again next launch.
    }
  };

  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),

    get: async (id) => {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const entry = (await load())[id];
      if (!entry) return null;
      try {
        return safeStorage.decryptString(Buffer.from(entry.encrypted, 'base64'));
      } catch {
        // The OS keychain entry is gone or unreadable (a migrated machine, a
        // reset keychain). Treat as "no password saved" rather than throwing.
        return null;
      }
    },

    set: async (config, password) => {
      // Degrade rather than throw: the connection itself still saved through
      // `connections-store.ts`, and the caller re-prompts for a password next
      // session instead of persisting one.
      if (!safeStorage.isEncryptionAvailable()) return;
      const entries = await load();
      entries[config.id] = {
        fingerprint: connectionFingerprint(config),
        encrypted: safeStorage.encryptString(password).toString('base64'),
      };
      await persist(entries);
    },

    delete: async (id) => {
      const entries = await load();
      delete entries[id];
      await persist(entries);
    },

    reconcile: async (config) => {
      const entries = await load();
      const entry = entries[config.id];
      if (entry && entry.fingerprint !== connectionFingerprint(config)) {
        delete entries[config.id];
        await persist(entries);
      }
    },
  };
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

/** Stores nothing and remembers nothing — the fallback before one is configured. */
export const nullCredentialVault: CredentialVault = {
  isAvailable: () => false,
  get: async () => null,
  set: async () => {},
  delete: async () => {},
  reconcile: async () => {},
};
