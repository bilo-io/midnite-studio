import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { safeStorage } from 'electron';

const VAULT_MODE = 0o600;

/** Whether OS-backed encryption is available for this session. */
export function isSafeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/** Encrypt a string for disk storage; throws when encryption is unavailable. */
export function encryptSecret(plaintext: string): string {
  return safeStorage.encryptString(plaintext).toString('base64');
}

/** Decrypt a stored blob; returns null when unreadable or encryption is off. */
export function decryptSecret(encrypted: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
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
 * A JSON file of encrypted entries under `userData`, with a fixed `0o600`
 * mode on every write — shared by the DB credential vault and the app secrets
 * vault (Phase 76 Theme D).
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
