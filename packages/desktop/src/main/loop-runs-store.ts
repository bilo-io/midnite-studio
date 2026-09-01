import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LoopRunRecordSchema, type LoopRunRecord } from '@midnite/studio-shared';

/**
 * FAB loop run history (Phase 35), in its own `loop-runs.json` — the same
 * shape and cap discipline as `councils-runs-store.ts`, and for the same
 * reason: history grows with every Start, and an unbounded JSON file under
 * `userData` is a slow leak nobody notices until it is minutes of parse time.
 */
const FILE_NAME = 'loop-runs.json';

/** Runs beyond this many (oldest first) are dropped on save — global. */
export const MAX_STORED_LOOP_RUNS = 200;

export type LoopRunsStore = {
  load: () => Promise<LoopRunRecord[]>;
  save: (runs: readonly LoopRunRecord[]) => Promise<void>;
};

type StoredState = { version: 1; runs: unknown[] };

export function createLoopRunsStore(directory: string): LoopRunsStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        return [];
      }
      return parseStoredLoopRuns(raw);
    },

    save: async (runs) => {
      const trimmed =
        runs.length > MAX_STORED_LOOP_RUNS ? runs.slice(runs.length - MAX_STORED_LOOP_RUNS) : runs;
      const state: StoredState = { version: 1, runs: [...trimmed] };
      try {
        await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir shouldn't take the app down.
      }
    },
  };
}

/** Exported for the store's own tests; drops one bad entry rather than the file. */
export function parseStoredLoopRuns(value: unknown): LoopRunRecord[] {
  if (typeof value !== 'object' || value === null) return [];
  const runs = (value as { runs?: unknown }).runs;
  if (!Array.isArray(runs)) return [];

  const result: LoopRunRecord[] = [];
  for (const entry of runs) {
    const parsed = LoopRunRecordSchema.safeParse(entry);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

export const nullLoopRunsStore: LoopRunsStore = {
  load: async () => [],
  save: async () => {},
};
