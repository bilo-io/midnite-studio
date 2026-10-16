import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { NoteSchema, type Note } from '@midnite/studio-shared';

/**
 * Notes captured against a repository, persisted per-repository on disk.
 *
 * Modelled on `session-history-store.ts` and `terminal-store.ts`:
 * - Persisted under the app's `userData/notes/<repoId>.json`, never inside
 *   the user's repository so notes never pollute git state or commit trees.
 * - Atomic writes via write-to-temp-and-rename so crashes never leave corrupt
 *   or half-written files on disk.
 * - In-memory cache with serialized and debounced writes per repository,
 *   guaranteeing multiple windows cannot interleave into corrupted files.
 * - Graceful degradation: missing or corrupt files return empty lists rather
 *   than crashing during `app.whenReady()`.
 */
export type NotesStore = {
  list: (repoId?: string) => Promise<Note[]>;
  save: (note: Note) => Promise<void>;
  delete: (id: string, repoId?: string) => Promise<void>;
  reorder: (repoId: string, noteIds: string[]) => Promise<void>;
  flush: (repoId?: string) => Promise<void>;
};

export type StoredNotesState = {
  version: 1;
  notes: Note[];
};

export type NotesStoreOptions = {
  debounceMs?: number;
};

const NOTES_DIR = 'notes';

/** Keep a repository identifier safe for filesystem path usage. */
export function safeRepoId(repoId: string): string {
  const sanitized = repoId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized.length > 0 ? sanitized : 'default';
}

/** Where a repository's saved notes live given the app's userData directory. */
export function repoNotesPath(directory: string, repoId: string): string {
  return join(directory, NOTES_DIR, `${safeRepoId(repoId)}.json`);
}

/**
 * Validate and parse raw stored notes.
 * Corrupt rows are dropped; valid rows are kept. If structure is totally invalid, returns empty array.
 */
export function parseNotesState(value: unknown): Note[] {
  if (typeof value !== 'object' || value === null) return [];
  const rawList = Array.isArray(value) ? value : (value as { notes?: unknown }).notes;
  if (!Array.isArray(rawList)) return [];
  const out: Note[] = [];
  for (const raw of rawList) {
    const parsed = NoteSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Sort notes in canonical user order:
 * `order` ascending, tie-broken by `createdAt` descending.
 */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort((a, b) => a.order - b.order || b.createdAt - a.createdAt);
}

/**
 * Write file atomically using temp file and rename.
 */
async function writeAtomic(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, filePath);
  } catch (err) {
    try {
      await rm(tmp, { force: true });
    } catch {
      // Best-effort cleanup
    }
    throw err;
  }
}

export function createNotesStore(directory: string, options?: NotesStoreOptions): NotesStore {
  const cache = new Map<string, Note[]>();
  const loadPromises = new Map<string, Promise<Note[]>>();
  const mutationChains = new Map<string, Promise<void>>();
  const debounceTimers = new Map<string, NodeJS.Timeout>();
  const writeChains = new Map<string, Promise<void>>();
  const debounceMs = options?.debounceMs ?? 25;
  // The file's mtime as this store last saw it (read or wrote). A different mtime with nothing of
  // ours pending means another process (Studio's quick capture into Mind's notebook) wrote the
  // file, and the cache must not be saved back over it.
  const stamps = new Map<string, number>();
  const dirty = new Set<string>();
  const mtimeOf = async (file: string): Promise<number | null> => {
    try {
      return (await stat(file)).mtimeMs;
    } catch {
      return null;
    }
  };

  const loadRepo = (repoId: string): Promise<Note[]> => {
    const key = safeRepoId(repoId);
    const cached = cache.get(key);
    if (cached && dirty.has(key)) return Promise.resolve(cached);
    if (cached) {
      return (async () => {
        const seen = stamps.get(key);
        const now = await mtimeOf(repoNotesPath(directory, repoId));
        // Missing file or unchanged: the cache stands. Changed under us: read it again.
        if (now === null || seen === undefined || now === seen || dirty.has(key)) return cache.get(key) ?? cached;
        cache.delete(key);
        return loadRepo(repoId);
      })();
    }

    const inFlight = loadPromises.get(key);
    if (inFlight) return inFlight;

    const promise = (async () => {
      const file = repoNotesPath(directory, repoId);
      let loaded: Note[] = [];
      try {
        const content = await readFile(file, 'utf8');
        loaded = parseNotesState(JSON.parse(content));
        const at = await mtimeOf(file);
        if (at !== null) stamps.set(key, at);
      } catch {
        // File missing (first run) or corrupt. A corrupt file must leave the
        // app bootable; degradation is starting empty rather than crashing.
        loaded = [];
      }
      cache.set(key, loaded);
      loadPromises.delete(key);
      return loaded;
    })();

    loadPromises.set(key, promise);
    return promise;
  };

  const loadAll = async (): Promise<Note[]> => {
    const notesDir = join(directory, NOTES_DIR);
    let files: string[] = [];
    try {
      files = await readdir(notesDir);
    } catch {
      files = [];
    }

    for (const f of files) {
      if (f.endsWith('.json')) {
        const repoKey = f.slice(0, -5);
        if (!cache.has(repoKey)) {
          const filePath = join(notesDir, f);
          try {
            const content = await readFile(filePath, 'utf8');
            cache.set(repoKey, parseNotesState(JSON.parse(content)));
          } catch {
            cache.set(repoKey, []);
          }
        }
      }
    }

    const allNotes: Note[] = [];
    for (const repoNotes of cache.values()) {
      allNotes.push(...repoNotes);
    }
    return allNotes;
  };

  const performWrite = async (repoId: string): Promise<void> => {
    const key = safeRepoId(repoId);
    const notes = cache.get(key) ?? [];
    const file = repoNotesPath(directory, repoId);
    const state: StoredNotesState = { version: 1, notes };
    try {
      await writeAtomic(file, `${JSON.stringify(state, null, 2)}\n`);
      const at = await mtimeOf(file);
      if (at !== null) stamps.set(key, at);
    } catch {
      // Read-only filesystem or write error degrades gracefully.
    } finally {
      if (!debounceTimers.has(key)) dirty.delete(key);
    }
  };

  const enqueueWrite = (repoId: string): Promise<void> => {
    const key = safeRepoId(repoId);
    const currentChain = writeChains.get(key) ?? Promise.resolve();
    const nextChain = currentChain.then(() => performWrite(repoId));
    writeChains.set(key, nextChain);
    return nextChain;
  };

  const scheduleWrite = (repoId: string) => {
    const key = safeRepoId(repoId);
    dirty.add(key);
    const existing = debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    if (debounceMs <= 0) {
      debounceTimers.delete(key);
      void enqueueWrite(repoId);
      return;
    }
    const timer = setTimeout(() => {
      debounceTimers.delete(key);
      void enqueueWrite(repoId);
    }, debounceMs);
    debounceTimers.set(key, timer);
  };

  const runMutation = <T>(repoId: string, op: () => Promise<T>): Promise<T> => {
    const key = safeRepoId(repoId);
    const prev = mutationChains.get(key) ?? Promise.resolve();
    let result: T;
    const next = prev.then(async () => {
      result = await op();
    });
    mutationChains.set(key, next);
    return next.then(() => result);
  };

  const flush = async (repoId?: string): Promise<void> => {
    if (repoId !== undefined) {
      const key = safeRepoId(repoId);
      await (mutationChains.get(key) ?? Promise.resolve());
      const timer = debounceTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(key);
        void enqueueWrite(repoId);
      }
      await (writeChains.get(key) ?? Promise.resolve());
    } else {
      await Promise.all(Array.from(mutationChains.values()));
      for (const [key, timer] of debounceTimers.entries()) {
        clearTimeout(timer);
        void enqueueWrite(key);
      }
      debounceTimers.clear();
      await Promise.all(Array.from(writeChains.values()));
    }
  };

  return {
    list: async (repoId?: string): Promise<Note[]> => {
      await flush(repoId);
      if (repoId !== undefined) {
        const notes = await loadRepo(repoId);
        return sortNotes(notes);
      }
      const notes = await loadAll();
      return sortNotes(notes);
    },

    save: (note: Note): Promise<void> =>
      runMutation(note.repoId, async () => {
        const key = safeRepoId(note.repoId);
        const current = await loadRepo(note.repoId);
        const existingIdx = current.findIndex((n) => n.id === note.id);
        let next: Note[];
        if (existingIdx >= 0) {
          next = [...current];
          next[existingIdx] = note;
        } else {
          next = [...current, note];
        }
        cache.set(key, next);
        scheduleWrite(note.repoId);
      }),

    delete: (id: string, repoId?: string): Promise<void> => {
      if (repoId !== undefined) {
        return runMutation(repoId, async () => {
          const key = safeRepoId(repoId);
          const current = await loadRepo(repoId);
          const next = current.filter((n) => n.id !== id);
          cache.set(key, next);
          scheduleWrite(repoId);
        });
      }

      return (async () => {
        await loadAll();
        const mutatedRepos: string[] = [];
        for (const [key, notes] of cache.entries()) {
          const match = notes.some((n) => n.id === id);
          if (match) {
            cache.set(key, notes.filter((n) => n.id !== id));
            mutatedRepos.push(key);
          }
        }
        for (const r of mutatedRepos) {
          scheduleWrite(r);
        }
      })();
    },

    reorder: (repoId: string, noteIds: string[]): Promise<void> =>
      runMutation(repoId, async () => {
        const key = safeRepoId(repoId);
        const current = await loadRepo(repoId);
        const namedSet = new Set(noteIds);
        const rest = current
          .filter((note) => !namedSet.has(note.id))
          .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt)
          .map((note) => note.id);

        const byId = new Map(current.map((n) => [n.id, n]));
        const next: Note[] = [];
        [...noteIds, ...rest].forEach((id, index) => {
          const note = byId.get(id);
          if (note) next.push({ ...note, order: index });
        });
        cache.set(key, next);
        scheduleWrite(repoId);
      }),

    flush,
  };
}

/** No store configured — fallback before boot wiring, and in tests that want no disk. */
export const nullNotesStore: NotesStore = {
  list: async () => [],
  save: async () => {},
  delete: async () => {},
  reorder: async () => {},
  flush: async () => {},
};
