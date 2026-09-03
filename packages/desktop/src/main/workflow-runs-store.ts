import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW,
  WorkflowRunSchema,
  type WorkflowRun,
} from '@midnite/studio-shared';

/**
 * Workflow run history, in `workflow-runs.json` beside the workflows.
 *
 * **The cap is per workflow, not global.** A workflow you run in a loop would
 * otherwise evict the history of one you run twice a week — the case a flat cap
 * gets wrong, and the reason this number (20) is so much smaller than
 * `MAX_STORED_LOOP_RUNS` (200, global).
 *
 * Trimming happens here AND at every write site, per Phase 45 Theme D: a store
 * that only trims the copy it writes to disk lets the in-memory array grow
 * without bound, which is the exact bug `council-service.ts`'s `saveRun` had.
 */
const FILE_NAME = 'workflow-runs.json';

export type WorkflowRunsStore = {
  load: () => Promise<WorkflowRun[]>;
  save: (runs: readonly WorkflowRun[]) => Promise<void>;
};

type StoredState = { version: 1; runs: unknown[] };

/**
 * Keep the newest {@link MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW} of each
 * workflow's runs, in the original order — the list stays newest-last overall,
 * so a consumer that reverses it gets a coherent history rather than one
 * grouped by workflow.
 */
export function trimRunsPerWorkflow(runs: readonly WorkflowRun[]): WorkflowRun[] {
  const kept = new Set<string>();
  const counts = new Map<string, number>();
  // Walk newest-first so the ones dropped are the oldest of each workflow.
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i]!;
    const seen = counts.get(run.workflowId) ?? 0;
    if (seen >= MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW) continue;
    counts.set(run.workflowId, seen + 1);
    kept.add(run.id);
  }
  return runs.filter((run) => kept.has(run.id));
}

export function createWorkflowRunsStore(directory: string): WorkflowRunsStore {
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
      const state: StoredState = { version: 1, runs: trimRunsPerWorkflow(runs) };
      try {
        await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      } catch {
        // See `workflows-store.ts` — a read-only data dir is not fatal.
      }
    },
  };
}

/** Exported for the store's own tests; drops one bad entry rather than the file. */
export function parseStoredRuns(value: unknown): WorkflowRun[] {
  if (typeof value !== 'object' || value === null) return [];
  const runs = (value as { runs?: unknown }).runs;
  if (!Array.isArray(runs)) return [];

  const result: WorkflowRun[] = [];
  for (const entry of runs) {
    const parsed = WorkflowRunSchema.safeParse(entry);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

export const nullWorkflowRunsStore: WorkflowRunsStore = {
  load: async () => [],
  save: async () => {},
};
