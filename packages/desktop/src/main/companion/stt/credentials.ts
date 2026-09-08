import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { safeStorage } from 'electron';

import { STT_PROVIDER_IDS, type SttProviderId } from '@midnite/studio-shared';

/**
 * Where the recogniser's API key lives (Phase 79 Theme F).
 *
 * `db/credential-vault.ts` line for line, and for its stated reasons:
 * `safeStorage.encryptString` into a versioned JSON file under `userData`,
 * never `localStorage`, never crossing to the renderer in plaintext, and a
 * corrupt file loading the safe default rather than throwing. That vault's own
 * docstring names the pattern it was fixing —
 * `features/finance/finance-store.ts` persisting an API key in plaintext
 * renderer `localStorage` — and this is the second key in the app that would
 * have gone the same way if the seam had lived in the renderer.
 *
 * Two things differ from the connection vault, both because of what a key
 * *is*:
 *
 * - **No fingerprint.** A connection's stored password is revoked when its
 *   host changes, because a secret typed in for one target must not silently
 *   reach another. A provider key has no target but the provider itself, which
 *   is the map key.
 * - **`configured()` rather than a plaintext read for the UI.** Settings needs
 *   "is a key stored", and that question is answerable without decrypting
 *   anything. The only caller that ever decrypts is the transcribe path, one
 *   request at a time.
 *
 * **Degrades rather than blocks** when `safeStorage.isEncryptionAvailable()`
 * is false, exactly as the connection vault does: the key is held for the
 * session in memory and asked for again next launch. That is a dev-machine
 * case — the only ship target is mac arm64, where `safeStorage` backs onto
 * Keychain.
 */
export type SttCredentials = {
  isAvailable: () => boolean;
  /** The plaintext key, or `null` when none is stored (or the keychain entry is unreadable). */
  get: (provider: SttProviderId) => Promise<string | null>;
  /** Store a key. An empty string clears it — the Settings field's own gesture. */
  set: (provider: SttProviderId, key: string) => Promise<void>;
  clear: (provider: SttProviderId) => Promise<void>;
  /** Which providers hold a key. Answers without decrypting one. */
  configured: () => Promise<SttProviderId[]>;
};

type StoredState = { version: 1; keys: Partial<Record<SttProviderId, string>> };

const FILE_NAME = 'companion-stt.vault.json';

export function createSttCredentials(directory: string): SttCredentials {
  const file = join(directory, FILE_NAME);
  /**
   * The session-memory fallback for a machine with no working keychain.
   *
   * Deliberately *not* a cache in front of the file: a decrypt is microseconds
   * and once per utterance, so caching plaintext keys in main for the life of
   * the process would be risk with no upside. This map is only ever written on
   * the `isEncryptionAvailable() === false` branch.
   */
  const sessionOnly = new Map<SttProviderId, string>();
  let cache: Partial<Record<SttProviderId, string>> | null = null;

  const load = async (): Promise<Partial<Record<SttProviderId, string>>> => {
    if (cache) return cache;
    try {
      cache = parseVaultState(JSON.parse(await readFile(file, 'utf8')));
    } catch {
      // Missing (nothing configured yet) or corrupt. "No key" is the honest
      // default and the Settings page renders it as "not configured".
      cache = {};
    }
    return cache;
  };

  const persist = async (keys: Partial<Record<SttProviderId, string>>): Promise<void> => {
    cache = keys;
    const state: StoredState = { version: 1, keys };
    try {
      await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch {
      // A read-only data dir must not take the app down; the key holds for
      // this session through `sessionOnly` and is asked for again next launch.
    }
  };

  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),

    get: async (provider) => {
      const inMemory = sessionOnly.get(provider);
      if (inMemory !== undefined) return inMemory;
      if (!safeStorage.isEncryptionAvailable()) return null;
      const encrypted = (await load())[provider];
      if (encrypted === undefined) return null;
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch {
        // The OS keychain entry is gone or unreadable (a migrated machine, a
        // reset keychain). "No key stored" is the recoverable answer; the
        // transcribe path turns it into "add a key in Settings".
        return null;
      }
    },

    set: async (provider, key) => {
      const trimmed = key.trim();
      if (trimmed.length === 0) {
        sessionOnly.delete(provider);
        const keys = { ...(await load()) };
        delete keys[provider];
        await persist(keys);
        return;
      }
      if (!safeStorage.isEncryptionAvailable()) {
        // Degrade: usable now, gone next launch. Reported to the UI through
        // `encryptionAvailable: false` rather than a silent success.
        sessionOnly.set(provider, trimmed);
        return;
      }
      await persist({
        ...(await load()),
        [provider]: safeStorage.encryptString(trimmed).toString('base64'),
      });
    },

    clear: async (provider) => {
      sessionOnly.delete(provider);
      const keys = { ...(await load()) };
      delete keys[provider];
      await persist(keys);
    },

    configured: async () => {
      const keys = await load();
      return STT_PROVIDER_IDS.filter(
        (provider) => sessionOnly.has(provider) || keys[provider] !== undefined,
      );
    },
  };
}

/**
 * Validate without zod, exactly as `companion-store.ts` and `mcp-store.ts` do:
 * this is main-only, the shape is a record of base64 strings, and anything
 * that is not one is dropped rather than coerced. A non-string reaching
 * `Buffer.from` would throw inside the decrypt path, where the only honest
 * recovery is the one this drop already gives — "no key stored".
 */
export function parseVaultState(value: unknown): Partial<Record<SttProviderId, string>> {
  if (typeof value !== 'object' || value === null) return {};
  const raw = (value as { keys?: unknown }).keys;
  if (typeof raw !== 'object' || raw === null) return {};

  const keys: Partial<Record<SttProviderId, string>> = {};
  for (const [provider, encrypted] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSttProviderId(provider)) continue;
    if (typeof encrypted === 'string' && encrypted.length > 0) keys[provider] = encrypted;
  }
  return keys;
}

function isSttProviderId(value: string): value is SttProviderId {
  return (STT_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Stores nothing and remembers nothing — the fallback before one is configured. */
export const nullSttCredentials: SttCredentials = {
  isAvailable: () => false,
  get: async () => null,
  set: async () => {},
  clear: async () => {},
  configured: async () => [],
};
