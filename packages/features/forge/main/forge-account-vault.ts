import { join } from 'node:path';

import { VAULT_NAMESPACES, type VaultClient } from '@midnite/studio-runtime';
import type { ForgeAccountVaultKey } from '@midnite/studio-shared';

/**
 * Where a forge account's PAT lives — the third binding over
 * `main/secure-store.ts`, beside `db/credential-vault.ts` and
 * `secrets-vault.ts` (both Phase 76 Theme D).
 *
 * **Since Phase 113 Theme D** all three are bindings over one runtime vault
 * (`@midnite/studio-runtime`'s `createVaultService`), this one over its
 * `forge-accounts` namespace; `secure-store.ts` moved into the runtime with
 * it. The file, the key format and the session-only fallback below are
 * unchanged — the fallback is now the namespace's `whenUnavailable:
 * 'session'`, held by the service so every app sees the same token.
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

const FILE_NAME = VAULT_NAMESPACES['forge-accounts'].fileName;
const NS = 'forge-accounts';

export function createForgeAccountVault(vault: VaultClient): ForgeAccountVault {
  return {
    isAvailable: () => vault.isAvailable(),
    get: (key) => vault.get(NS, key),
    set: (key, token) => vault.set(NS, key, token),
    delete: (key) => vault.delete(NS, key),
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
