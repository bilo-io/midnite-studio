import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The list of repository paths the user has open, persisted across launches.
 *
 * Only paths are stored, never derived state: branches, worktrees and refs all
 * change while the app is closed, and a cached copy would render a confidently
 * wrong sidebar on the next launch. Everything else is re-read from git at open
 * time.
 *
 * A plain JSON file rather than a database — it's a short list of strings, and a
 * corrupt one should cost the user their open tabs and nothing more.
 *
 * The directory is injected rather than read from `app.getPath('userData')`
 * here, so this module (and the registry above it) carries no `electron`
 * import and both stay testable against a temp dir.
 */
export type RepoStore = {
  load: () => Promise<string[]>;
  save: (paths: readonly string[]) => Promise<void>;
};

type StoredState = { version: 1; paths: string[] };

const FILE_NAME = 'repos.json';

export function createRepoStore(directory: string): RepoStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      try {
        return parseStoredState(JSON.parse(await readFile(file, 'utf8')));
      } catch {
        // Missing (first launch) or unreadable/corrupt — start empty rather
        // than failing boot over a list of recently-opened folders.
        return [];
      }
    },

    save: async (paths) => {
      const state: StoredState = { version: 1, paths: [...paths] };
      try {
        await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir shouldn't take the app down; the session still
        // works, it just won't be remembered.
      }
    },
  };
}

/**
 * Validate without zod: this module is main-only and the shape is two fields.
 * Pulling the schema layer in for it would add a runtime dependency where a
 * type guard does the job.
 */
export function parseStoredState(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return [];
  const paths = (value as { paths?: unknown }).paths;
  if (!Array.isArray(paths)) return [];
  return paths.filter((p): p is string => typeof p === 'string' && p.length > 0);
}

/** A store that remembers nothing — the fallback before one is configured. */
export const nullRepoStore: RepoStore = {
  load: async () => [],
  save: async () => {},
};
