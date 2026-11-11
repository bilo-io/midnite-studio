import { randomBytes } from 'node:crypto';
import { readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { ensurePrivateDir, writePrivateFile } from './private-files';

/**
 * One JSON file per item in a private directory (Phase 126 Theme B) — what Science notebooks, Simulator
 * scenarios and Health logs all need. Lives in the runtime because a module may not import another module.
 *
 * The id is the file name, so `idPattern` is the path jail: `pathOf` throws on a miss before any path is built.
 * Writes are atomic 0600 (`writePrivateFile`); a file that fails to parse is renamed aside and counted, never
 * deleted and never fatal.
 */
export type JsonDirStore<T extends { id: string; updatedAt: string }> = {
  list(): Promise<{ items: T[]; quarantined: number }>;
  read(id: string): Promise<T | null>;
  write(item: T): Promise<void>;
  exists(id: string): Promise<boolean>;
  mintId(): string;
  pathOf(id: string): string;
};

export type JsonDirStoreOptions<T> = {
  dir: string;
  /** The id prefix, e.g. `nb-`; also what `list` filters files by. */
  prefix: string;
  idPattern: RegExp;
  /** `null` means "not a valid item": the file is quarantined. */
  parse: (raw: unknown) => T | null;
};

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function createJsonDirStore<T extends { id: string; updatedAt: string }>(opts: JsonDirStoreOptions<T>): JsonDirStore<T> {
  const { dir, prefix, idPattern, parse } = opts;

  const pathOf = (id: string): string => {
    if (!idPattern.test(id)) throw new Error(`invalid id: ${id}`);
    return join(dir, `${id}.json`);
  };

  const readItem = async (id: string): Promise<T | null> => {
    try {
      return parse(JSON.parse(await readFile(pathOf(id), 'utf8')));
    } catch {
      return null;
    }
  };

  return {
    pathOf,
    mintId() {
      const bytes = randomBytes(12);
      let out = prefix;
      for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
      return out;
    },
    async list() {
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        return { items: [], quarantined: 0 };
      }
      const items: T[] = [];
      let quarantined = 0;
      for (const name of names) {
        if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
        const file = join(dir, name);
        let item: T | null = null;
        try {
          item = parse(JSON.parse(await readFile(file, 'utf8')));
        } catch {
          item = null;
        }
        // The file name is the id: a file whose content names another id is as foreign as unparsable one.
        if (item !== null && `${item.id}.json` === name) {
          items.push(item);
          continue;
        }
        quarantined += 1;
        try {
          await rename(file, `${file}.corrupt-${Date.now()}`);
        } catch {
          // best effort: an unmovable file is still counted
        }
      }
      items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
      return { items, quarantined };
    },
    read: readItem,
    async write(item) {
      const file = pathOf(item.id);
      await ensurePrivateDir(dir);
      await writePrivateFile(file, `${JSON.stringify(item, null, 2)}\n`);
    },
    async exists(id) {
      return (await readItem(id)) !== null;
    },
  };
}
