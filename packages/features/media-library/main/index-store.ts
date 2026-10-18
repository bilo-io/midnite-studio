import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DEFAULT_LIBRARY_SETTINGS,
  LibraryItemSchema,
  LibraryProgressSchema,
  LibraryRootSchema,
  LibrarySettingsSchema,
  type LibraryItem,
  type LibraryProgress,
  type LibraryRoot,
  type LibrarySettings,
} from '@midnite/studio-shared';
import { z } from 'zod';

/**
 * The library's persisted index (Phase 113 Theme R): one JSON file, `library.json`, under the data
 * directory the composer injects (Studio: `<userData>/media-library`; Midnite Media: its own userData).
 * Never under a root — the library writes nothing into the user's folders.
 *
 * Progress is kept apart from items, keyed by the item's stable id, so a rescan that drops and re-finds a
 * file (a rename back, a drive remounted) keeps where the user was. Writes are atomic (a temp file, then a
 * rename) and serialised, so a crash mid-write leaves the previous index, never half of one.
 */

/** What a scan keeps beside the wire item, to skip re-reading a file that has not changed. */
export const StoredItemSchema = LibraryItemSchema.omit({ progress: true }).extend({
  /** The sidecar `.nfo`'s mtime when it was last read, or null without one. */
  nfoMtimeMs: z.number().nullable(),
  /** When the online provider was last asked about this item (it is asked once, not every scan). */
  onlineCheckedAt: z.number().nullable(),
});
export type StoredItem = z.infer<typeof StoredItemSchema>;

export const LIBRARY_INDEX_VERSION = 1;

const IndexSchema = z.object({
  version: z.literal(LIBRARY_INDEX_VERSION),
  roots: z.array(LibraryRootSchema),
  items: z.record(StoredItemSchema),
  progress: z.record(LibraryProgressSchema),
  settings: LibrarySettingsSchema,
});
export type LibraryIndex = z.infer<typeof IndexSchema>;

export const emptyIndex = (): LibraryIndex => ({
  version: LIBRARY_INDEX_VERSION,
  roots: [],
  items: {},
  progress: {},
  settings: { ...DEFAULT_LIBRARY_SETTINGS },
});

export const INDEX_FILE = 'library.json';

export type IndexStore = {
  /** The index, loaded once. */
  read: () => Promise<LibraryIndex>;
  /** Applies `change` to the loaded index and persists it; resolves once it is on disk. */
  update: (change: (index: LibraryIndex) => void) => Promise<LibraryIndex>;
};

export function createIndexStore(dataDir: string): IndexStore {
  const file = join(dataDir, INDEX_FILE);
  let loaded: Promise<LibraryIndex> | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  const load = async (): Promise<LibraryIndex> => {
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      return emptyIndex();
    }
    try {
      const parsed = IndexSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // fall through: unreadable JSON
    }
    // Keep the unreadable file beside the fresh one rather than overwrite what a user may want back.
    await rename(file, `${file}.unreadable-${Date.now()}`).catch(() => undefined);
    return emptyIndex();
  };

  const read = () => (loaded ??= load());

  const persist = async (index: LibraryIndex): Promise<void> => {
    await mkdir(dataDir, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(index), 'utf8');
    await rename(temp, file);
  };

  return {
    read,
    update: (change) => {
      const next = chain.then(async () => {
        const index = await read();
        change(index);
        await persist(index);
        return index;
      });
      chain = next.catch(() => undefined);
      return next;
    },
  };
}

/** The wire item: the stored one with its progress joined on. */
export function toWireItem(stored: StoredItem, progress: LibraryProgress | undefined): LibraryItem {
  const { nfoMtimeMs: _nfo, onlineCheckedAt: _online, ...item } = stored;
  return { ...item, progress: progress ?? null };
}

export type { LibraryRoot, LibrarySettings };
