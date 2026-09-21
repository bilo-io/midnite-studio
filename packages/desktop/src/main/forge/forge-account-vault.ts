import { join } from 'node:path';

import type { ForgeAccountVaultKey } from '@midnite/studio-shared';

import { createSecureJsonStore, decryptSecret, encryptSecret, isSafeStorageAvailable } from '../secure-store';

/**
 * Where a forge account's PAT lives — the third binding over
 * `main/secure-store.ts`, beside `db/credential-vault.ts` and
 * `secrets-vault.ts` (both Phase 76 Theme D).
 *
 * **Phase 90's own doc named a collision here that no longer exists.** The
 * phase's plan called for extracting `credential-vault.ts`'s `safeStorage`
 * plumbing into a new `main/secrets/secret-vault.ts`, and noted Phase 76
 * Theme D was planning the identical extraction as `main/secure-store.ts`,
 * with "whichever executes first creates the module." Theme D landed first —
 * `secure-store.ts` already exists, `credential-vault.ts` and
 * `secrets-vault.ts` are already thin bindings over it, and
 * `credential-vault.test.ts` already passes unchanged against it. So this
 * module does not re-extract anything; it is a third consumer of the
 * primitive Theme D already generalised, at 0600 in a 0700 directory from
 * line one because `createSecureJsonStore` always chmods its write.
 *
 * The one behaviour this vault does NOT share with its two siblings:
 * `credential-vault.ts` and `secrets-vault.ts` both drop a `set()` silently
 * when `safeStorage.isEncryptionAvailable()` is false. This vault degrades
 * the way `companion/stt/credentials.ts` does instead — a token typed in on
 * a machine with no working keychain is held in a **session-only** in-memory
 * map and reported through `isAvailable()`, rather than silently discarded.
 * A user who pasted a PAT and got no error would paste it again; "degrade
 * loudly, session-only" is the Phase 90/91-grounded call for a *new* vault,
 * without touching the two existing ones' tested behaviour.
 */
export type ForgeAccountVault = {
  isAvailable: () => boolean;
  get: (key: ForgeAccountVaultKey) => Promise<string | null>;
  set: (key: ForgeAccountVaultKey, token: string) => Promise<void>;
  delete: (key: ForgeAccountVaultKey) => Promise<void>;
};

type VaultEntry = { encrypted: string };

const FILE_NAME = 'forge-accounts.vault.json';

function parseVaultState(value: unknown): Record<string, VaultEntry> {
  if (typeof value !== 'object' || value === null) return {};
  const entries = (value as { entries?: unknown }).entries;
  if (typeof entries !== 'object' || entries === null) return {};

  const out: Record<string, VaultEntry> = {};
  for (const [id, raw] of Object.entries(entries as Record<string, unknown>)) {
    if (!id || typeof raw !== 'object' || raw === null) continue;
    const encrypted = (raw as Record<string, unknown>)['encrypted'];
    if (typeof encrypted === 'string') out[id] = { encrypted };
  }
  return out;
}

export function createForgeAccountVault(directory: string): ForgeAccountVault {
  const store = createSecureJsonStore<VaultEntry>(directory, FILE_NAME, parseVaultState);
  // Only ever written on the `!isSafeStorageAvailable()` branch — see the
  // module docblock. Not a cache in front of the file: a decrypt costs
  // microseconds and happens once per account action, so caching plaintext
  // tokens in main for the process lifetime would be risk with no upside.
  const sessionOnly = new Map<ForgeAccountVaultKey, string>();

  return {
    isAvailable: isSafeStorageAvailable,

    get: async (key) => {
      const inMemory = sessionOnly.get(key);
      if (inMemory !== undefined) return inMemory;
      const entry = await store.get(key);
      if (!entry) return null;
      return decryptSecret(entry.encrypted);
    },

    set: async (key, token) => {
      if (!isSafeStorageAvailable()) {
        sessionOnly.set(key, token);
        return;
      }
      sessionOnly.delete(key);
      await store.set(key, { encrypted: encryptSecret(token) });
    },

    delete: async (key) => {
      sessionOnly.delete(key);
      await store.delete(key);
    },
  };
}

/** Resolve the on-disk path — tests assert mode without reaching into the vault. */
export function forgeAccountVaultPath(directory: string): string {
  return join(directory, FILE_NAME);
}

/** Stores nothing and remembers nothing — the fallback before one is configured. */
export const nullForgeAccountVault: ForgeAccountVault = {
  isAvailable: () => false,
  get: async () => null,
  set: async () => {},
  delete: async () => {},
};
