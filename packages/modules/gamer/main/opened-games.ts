import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { ok, type GitOpResult } from '@midnite/studio-shared';

/**
 * Gamer's list of games opened from outside the games root (Phase 132 Theme A). Gamer has no repository
 * list, so Open Game keeps its folders here, behind the same two ports Studio fills from its repo registry.
 * A stored path that loses its manifest drops out of the list by itself (`listGames` skips it) and stays
 * stored, so a re-attached drive brings it back.
 */
const FILE_NAME = 'opened-games.json';

export type OpenedGamesStore = {
  list: () => Promise<string[]>;
  /** Append a folder, deduped by realpath. */
  add: (path: string) => Promise<GitOpResult>;
  /** Drop a folder from the list (matched by realpath, so a moved symlink still goes). The folder itself is untouched. */
  remove: (path: string) => Promise<GitOpResult>;
};

/** Tolerant: an unreadable or hand-broken file reads as no paths. */
async function readPaths(file: string): Promise<string[]> {
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as { paths?: unknown };
    return Array.isArray(value.paths) ? value.paths.filter((p): p is string => typeof p === 'string' && p !== '') : [];
  } catch {
    return [];
  }
}

const real = (path: string): Promise<string> => realpath(path).catch(() => path);

export function createOpenedGamesStore(userData: string): OpenedGamesStore {
  const file = join(userData, FILE_NAME);
  return {
    list: () => readPaths(file),
    async add(path) {
      const paths = await readPaths(file);
      const wanted = await real(path);
      for (const existing of paths) if ((await real(existing)) === wanted) return ok();
      try {
        await mkdir(dirname(file), { recursive: true });
        const temp = `${file}.tmp`;
        await writeFile(temp, `${JSON.stringify({ version: 1, paths: [...paths, path] }, null, 2)}\n`, 'utf8');
        await rename(temp, file);
      } catch (error) {
        return { ok: false, kind: 'error', message: `Could not save the opened game: ${error instanceof Error ? error.message : String(error)}` };
      }
      return ok();
    },
    async remove(path) {
      const paths = await readPaths(file);
      const wanted = await real(path);
      const kept: string[] = [];
      for (const existing of paths) if ((await real(existing)) !== wanted) kept.push(existing);
      if (kept.length === paths.length) return ok();
      try {
        const temp = `${file}.tmp`;
        await writeFile(temp, `${JSON.stringify({ version: 1, paths: kept }, null, 2)}\n`, 'utf8');
        await rename(temp, file);
      } catch (error) {
        return { ok: false, kind: 'error', message: `Could not save the opened games: ${error instanceof Error ? error.message : String(error)}` };
      }
      return ok();
    },
  };
}
