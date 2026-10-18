import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  captureFileName,
  captureIdFor,
  CaptureIdSchema,
  CaptureItemSchema,
  type CaptureItem,
  type CaptureMime,
} from '@midnite/studio-shared';
import { z } from 'zod';

/**
 * The captures on disk (Phase 113 Theme K): one directory the composer injects, holding each capture as
 * `<id>.png` / `<id>.webm` and an `index.json` of what each one is. Ids — and so file names — are made
 * here and only here; nothing the renderer sends is ever used as a name or a path.
 *
 * Writes are atomic (a temp file, then a rename) and the index is updated through one chain, so two
 * captures landing together cannot drop each other's entry. Listing reconciles against the directory: an
 * entry whose file the user deleted in Finder disappears instead of showing a broken tile.
 */
export const CAPTURES_DIR = 'captures';
export const CAPTURE_INDEX_FILE = 'index.json';

const IndexSchema = z.object({ version: z.literal(1), captures: z.array(CaptureItemSchema) });

export type CaptureStore = {
  /** The directory captures land in. */
  dir: string;
  /** A fresh id for a capture taken now. */
  newId: () => string;
  /** Writes `bytes` as a new capture file and records it; resolves with the entry. */
  add: (entry: Omit<CaptureItem, 'fileName' | 'bytes'> & { bytes: Uint8Array }) => Promise<CaptureItem>;
  /** Records a file already written into the directory (a finished recording). */
  record: (entry: Omit<CaptureItem, 'bytes'>) => Promise<CaptureItem>;
  /** Every capture still on disk, newest first. */
  list: () => Promise<CaptureItem[]>;
  get: (id: string) => Promise<CaptureItem | null>;
  /** Drops an entry from the index (the file is the caller's to trash). */
  forget: (id: string) => Promise<void>;
  /** The absolute path of a capture's file — main's, for trash, reveal and send-to. */
  pathOf: (item: CaptureItem) => string;
};

export function createCaptureStore(dataDir: string, now: () => Date = () => new Date()): CaptureStore {
  const dir = join(dataDir, CAPTURES_DIR);
  const indexFile = join(dir, CAPTURE_INDEX_FILE);
  let chain: Promise<unknown> = Promise.resolve();
  let cached: CaptureItem[] | null = null;

  const load = async (): Promise<CaptureItem[]> => {
    if (cached) return cached;
    try {
      const parsed = IndexSchema.safeParse(JSON.parse(await readFile(indexFile, 'utf8')));
      cached = parsed.success ? parsed.data.captures : [];
    } catch {
      cached = [];
    }
    return cached;
  };

  const persist = async (captures: CaptureItem[]): Promise<void> => {
    await mkdir(dir, { recursive: true });
    const tmp = `${indexFile}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, JSON.stringify({ version: 1, captures }, null, 2));
    await rename(tmp, indexFile);
    cached = captures;
  };

  const update = <T>(change: (captures: CaptureItem[]) => Promise<{ next: CaptureItem[]; result: T }>) => {
    const run = chain.then(async () => {
      const { next, result } = await change([...(await load())]);
      await persist(next);
      return result;
    });
    chain = run.catch(() => undefined);
    return run;
  };

  const exists = async (path: string) => {
    try {
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  };

  const store: CaptureStore = {
    dir,
    newId: () => captureIdFor(now(), randomBytes(4).toString('hex')),
    add: ({ bytes, ...entry }) =>
      update(async (captures) => {
        const fileName = captureFileName(entry.id, entry.mime as CaptureMime);
        await mkdir(dir, { recursive: true });
        const target = join(dir, fileName);
        const tmp = `${target}.tmp`;
        await writeFile(tmp, bytes);
        await rename(tmp, target);
        const item = CaptureItemSchema.parse({ ...entry, fileName, bytes: bytes.byteLength });
        return { next: [item, ...captures.filter((c) => c.id !== item.id)], result: item };
      }),
    record: (entry) =>
      update(async (captures) => {
        const size = (await stat(join(dir, entry.fileName))).size;
        const item = CaptureItemSchema.parse({ ...entry, bytes: size });
        return { next: [item, ...captures.filter((c) => c.id !== item.id)], result: item };
      }),
    list: async () => {
      await chain;
      const captures = await load();
      const present: CaptureItem[] = [];
      for (const item of captures) if (await exists(join(dir, item.fileName))) present.push(item);
      return present.sort((a, b) => b.createdAt - a.createdAt);
    },
    get: async (id) => {
      if (!CaptureIdSchema.safeParse(id).success) return null;
      const item = (await store.list()).find((c) => c.id === id);
      return item ?? null;
    },
    forget: (id) => update(async (captures) => ({ next: captures.filter((c) => c.id !== id), result: undefined })),
    pathOf: (item) => join(dir, item.fileName),
  };
  return store;
}
