import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CouncilRunSchema, type CouncilRun } from '@midnite/studio-shared';

/**
 * Council run history, in its own file (`council-runs.json`) rather than a
 * second key in `councils.json` — a council's own config (name, members,
 * synthesizer) changes rarely, while its run history grows with every
 * "Run" click, and mixing the two write profiles in one JSON file would mean
 * rewriting the whole roster every time a run's status ticks over.
 */
const FILE_NAME = 'council-runs.json';

/**
 * Runs beyond this many (oldest first) are dropped on save — global across all
 * councils, not per-council. A council run's captured output is already
 * capped per-member (`COUNCIL_OUTPUT_CAP_BYTES`); this is the equivalent bound
 * on how much *history* accumulates, so `council-runs.json` cannot grow
 * unbounded over the life of the app.
 */
export const MAX_STORED_RUNS = 200;

export type CouncilsRunsStore = {
  load: () => Promise<CouncilRun[]>;
  save: (runs: readonly CouncilRun[]) => Promise<void>;
};

type StoredState = { version: 1; runs: unknown[] };

export function createCouncilsRunsStore(directory: string): CouncilsRunsStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        return [];
      }
      return parseStoredRuns(raw);
    },

    save: async (runs) => {
      const trimmed = runs.length > MAX_STORED_RUNS ? runs.slice(runs.length - MAX_STORED_RUNS) : runs;
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
export function parseStoredRuns(value: unknown): CouncilRun[] {
  if (typeof value !== 'object' || value === null) return [];
  const runs = (value as { runs?: unknown }).runs;
  if (!Array.isArray(runs)) return [];

  const result: CouncilRun[] = [];
  for (const entry of runs) {
    const parsed = CouncilRunSchema.safeParse(entry);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

export const nullCouncilsRunsStore: CouncilsRunsStore = {
  load: async () => [],
  save: async () => {},
};
