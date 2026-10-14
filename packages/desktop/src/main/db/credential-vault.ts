import { join } from 'node:path';

import { VAULT_NAMESPACES, type VaultClient } from '@midnite/studio-runtime';
import type { ConnectionConfig } from '@midnite/studio-shared';

/**
 * Where a saved connection's password actually lives — `safeStorage` keyed per
 * connection id, the encrypted blob stored **alongside, not inside**
 * `db-connections.json` (a separate `db-connections.vault.json`).
 *
 * The app secrets vault (`secrets-vault.ts`) uses the same `secure-store`
 * helpers for the Twelve Data key (Phase 76 Theme D). Since Phase 113 Theme D
 * both are bindings over the runtime vault — this one over its
 * `db-credentials` namespace, which reads and writes the same file.
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

const FILE_NAME = VAULT_NAMESPACES['db-credentials'].fileName;
const NS = 'db-credentials';

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

export function createCredentialVault(vault: VaultClient): CredentialVault {
  return {
    isAvailable: () => vault.isAvailable(),

    get: (id) => vault.get(NS, id),

    set: (config, password) => vault.set(NS, config.id, password, { fingerprint: connectionFingerprint(config) }),

    delete: (id) => vault.delete(NS, id),

    reconcile: async (config) => {
      const stored = await vault.fingerprint(NS, config.id);
      if (stored !== null && stored !== connectionFingerprint(config)) {
        await vault.delete(NS, config.id);
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
