import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The encryption primitive under every vault — Phase 76 Theme D's
 * `desktop/src/main/secure-store.ts`, moved into the runtime by Phase 113
 * Theme D.
 *
 * **The cipher is injected, never imported.** The runtime may import
 * `electron`, but the vault does not: the composer hands it
 * `electron.safeStorage` (which satisfies {@link VaultCipher} structurally),
 * and tests hand it a fake. That keeps every vault test under bare vitest with
 * no `vi.mock('electron')`, and it makes the one thing that decides which key
 * encrypts the data — *which process* composed the service — visible at the
 * call site rather than hidden in an import. See `vault-service.ts` for why
 * that has to be the runtime's process.
 */
export interface VaultCipher {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

const VAULT_MODE = 0o600;

/** Encrypt a string for disk storage; throws when encryption is unavailable. */
export function encryptSecret(cipher: VaultCipher, plaintext: string): string {
  return cipher.encryptString(plaintext).toString('base64');
}

/** Decrypt a stored blob; returns null when unreadable or encryption is off. */
export function decryptSecret(cipher: VaultCipher, encrypted: string): string | null {
  if (!cipher.isEncryptionAvailable()) return null;
  try {
    return cipher.decryptString(Buffer.from(encrypted, 'base64'));
  } catch {
    return null;
  }
}

export type SecureJsonStore<TEntry> = {
  get: (id: string) => Promise<TEntry | null>;
  set: (id: string, entry: TEntry) => Promise<void>;
  delete: (id: string) => Promise<void>;
};

/**
 * A JSON file of encrypted entries, with a fixed `0o600` mode on every write.
 * The file is `{ version: 1, entries }` — the shape every vault file on disk
 * already has, which is what lets the runtime's service open them unchanged.
 */
export function createSecureJsonStore<TEntry>(
  directory: string,
  fileName: string,
  parseEntries: (value: unknown) => Record<string, TEntry>,
): SecureJsonStore<TEntry> {
  const file = join(directory, fileName);
  let cache: Record<string, TEntry> | null = null;

  const load = async (): Promise<Record<string, TEntry>> => {
    if (cache) return cache;
    try {
      cache = parseEntries(JSON.parse(await readFile(file, 'utf8')));
    } catch {
      cache = {};
    }
    return cache;
  };

  const persist = async (entries: Record<string, TEntry>): Promise<void> => {
    try {
      await writeFile(file, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, 'utf8');
      await chmod(file, VAULT_MODE);
    } catch {
      // A read-only data dir must not take the app down.
    }
  };

  return {
    get: async (id) => (await load())[id] ?? null,
    set: async (id, entry) => {
      const entries = await load();
      entries[id] = entry;
      cache = entries;
      await persist(entries);
    },
    delete: async (id) => {
      const entries = await load();
      delete entries[id];
      cache = entries;
      await persist(entries);
    },
  };
}
