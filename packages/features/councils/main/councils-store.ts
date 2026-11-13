import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CouncilSchema, type Council } from '@midnite/studio-shared';

/**
 * Councils, persisted globally (not per-repo) under Electron's `userData` —
 * one `councils.json`, mirroring `repo-store.ts`/`agents-store.ts`'s shape.
 *
 * Unlike `agents.json`, this file is **app-owned**: the user never hand-edits
 * it, so there is no "builtin defaults merged with overrides" step, only a
 * plain array. Entries still validate individually on load — one malformed
 * council (a hand corruption, a future schema change) costs the user that
 * council and nothing else in the file.
 */
const FILE_NAME = 'councils.json';

export type CouncilsStore = {
  load: () => Promise<Council[]>;
  save: (councils: readonly Council[]) => Promise<void>;
};

/**
 * v2 (Phase 134 Theme A): each council carries a `synthesisType`. A v1 file
 * is migrated on load — every council becomes a brainstorm, which is what it
 * always was — and written back as v2 on the next save.
 */
export const COUNCILS_STORE_VERSION = 2;

type StoredState = { version: typeof COUNCILS_STORE_VERSION; councils: unknown[] };

export function createCouncilsStore(directory: string): CouncilsStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        // Missing (first launch) or unreadable/corrupt — start with no councils.
        return [];
      }
      return parseStoredCouncils(raw);
    },

    save: async (councils) => {
      const state: StoredState = { version: COUNCILS_STORE_VERSION, councils: [...councils] };
      try {
        await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir shouldn't take the app down; the session still
        // works, it just won't be remembered.
      }
    },
  };
}

/** Exported for the store's own tests; drops one bad entry rather than the file. */
export function parseStoredCouncils(value: unknown): Council[] {
  if (typeof value !== 'object' || value === null) return [];
  const { councils, version } = value as { councils?: unknown; version?: unknown };
  if (!Array.isArray(councils)) return [];

  const result: Council[] = [];
  for (const entry of councils) {
    const parsed = CouncilSchema.safeParse(typeof version === 'number' && version < 2 ? migrateV1Council(entry) : entry);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

/** v1 → v2: a council from before synthesis types is a brainstorm. */
export function migrateV1Council(entry: unknown): unknown {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return entry;
  return { synthesisType: 'brainstorm', ...(entry as Record<string, unknown>) };
}

/** A store that remembers nothing — the fallback before one is configured. */
export const nullCouncilsStore: CouncilsStore = {
  load: async () => [],
  save: async () => {},
};
