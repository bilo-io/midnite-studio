import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DEFAULT_LIBRARY_LAN_SETTINGS,
  LibraryLanSettingsSchema,
  type LibraryLanSettings,
} from '@midnite/studio-shared';

/**
 * The LAN server's two files under the library's data dir (Phase 113 Theme R slice 2):
 *
 * - **`lan.json`** — its settings (`LibraryLanSettings`), apart from `library.json` so a bad write to one never
 *   costs the other.
 * - **`lan-token`** — the access token, mode `0600`. It is a *sharing* token the user hands out in a link, so it
 *   lives here, not in the vault; it is never logged and never written anywhere else.
 */

export const LAN_SETTINGS_FILE = 'lan.json';
export const LAN_TOKEN_FILE = 'lan-token';
/** 32 random bytes — 256 bits — as base64url (43 characters). */
const TOKEN_BYTES = 32;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

const writeAtomic = async (dir: string, file: string, text: string, mode?: number) => {
  await mkdir(dir, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, text, mode === undefined ? 'utf8' : { encoding: 'utf8', mode });
  if (mode !== undefined) await chmod(temp, mode).catch(() => undefined);
  await rename(temp, file);
};

export type LanSettingsStore = {
  read: () => Promise<LibraryLanSettings>;
  update: (patch: Partial<LibraryLanSettings>) => Promise<LibraryLanSettings>;
};

export function createLanSettingsStore(dataDir: string): LanSettingsStore {
  const file = join(dataDir, LAN_SETTINGS_FILE);
  let current: Promise<LibraryLanSettings> | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  const load = async (): Promise<LibraryLanSettings> => {
    try {
      const parsed = LibraryLanSettingsSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
      if (parsed.success) return parsed.data;
    } catch {
      // missing or unreadable: the defaults, which keep the server off
    }
    return { ...DEFAULT_LIBRARY_LAN_SETTINGS };
  };
  const read = () => (current ??= load());
  return {
    read: async () => ({ ...(await read()) }),
    update: (patch) => {
      const next = chain.then(async () => {
        const merged = LibraryLanSettingsSchema.parse({ ...(await read()), ...patch });
        await writeAtomic(dataDir, file, JSON.stringify(merged));
        current = Promise.resolve(merged);
        return { ...merged };
      });
      chain = next.catch(() => undefined);
      return next;
    },
  };
}

export type LanTokenStore = {
  /** The current token, minted on first use. */
  token: () => Promise<string>;
  /** Mints a new token; the old one stops matching at once. */
  regenerate: () => Promise<string>;
  /** Whether `candidate` is the current token — compared in constant time over fixed-length digests. */
  matches: (candidate: string | null) => Promise<boolean>;
};

const digest = (text: string): Buffer => createHash('sha256').update(text, 'utf8').digest();

export function createLanTokenStore(
  dataDir: string,
  random: (bytes: number) => Buffer = randomBytes,
): LanTokenStore {
  const file = join(dataDir, LAN_TOKEN_FILE);
  let current: Promise<string> | null = null;
  const mint = async (): Promise<string> => {
    const token = random(TOKEN_BYTES).toString('base64url');
    await writeAtomic(dataDir, file, token, 0o600);
    return token;
  };
  const load = async (): Promise<string> => {
    try {
      const saved = (await readFile(file, 'utf8')).trim();
      if (TOKEN_SHAPE.test(saved)) return saved;
    } catch {
      // first run
    }
    return mint();
  };
  const token = () => (current ??= load());
  return {
    token,
    regenerate: async () => {
      const next = mint();
      current = next;
      return next;
    },
    matches: async (candidate) => {
      const expected = await token();
      // Hashing first makes both sides 32 bytes, so neither the length nor the content leaks through timing.
      return timingSafeEqual(digest(candidate ?? ''), digest(expected)) && candidate !== null;
    },
  };
}
