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
export function trimRunsPerWorkflow(
  runs: readonly WorkflowRun[],
  /** Theme I's settings page overrides this; existing callers (tests included) keep the constant. */
  cap: number = MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW,
): WorkflowRun[] {
  const kept = new Set<string>();
  const counts = new Map<string, number>();
  // Walk newest-first so the ones dropped are the oldest of each workflow.
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i]!;
    /*
      A run still `running` is never evicted, and does not count against the
      cap. The engine reads its run back from the store on every node settle,
      so trimming one out mid-flight makes `getRun` answer null — the driver
      then finds nothing to do, breaks, and `finalizeRun` no-ops: the run
      vanishes from history while its already-launched fetches carry on. The
      cap exists to bound history, and a live run is not history yet.
    */
    if (run.status === 'running') {
      kept.add(run.id);
      continue;
    }
    const seen = counts.get(run.workflowId) ?? 0;
    if (seen >= cap) continue;
    counts.set(run.workflowId, seen + 1);
    kept.add(run.id);
  }
  return runs.filter((run) => kept.has(run.id));
}

export function createWorkflowRunsStore(
  directory: string,
  /** Theme I: read live so a settings change applies to the very next save. */
  getCap: () => number = () => MAX_STORED_WORKFLOW_RUNS_PER_WORKFLOW,
): WorkflowRunsStore {
  const file = join(directory, FILE_NAME);
  /*
    One writer at a time, the `write-queue.ts` idiom.

    The engine's mutation lock is keyed by runId, so two runs in flight at once
    — normal, since workflows are global and Run is not exclusive — settle
    nodes under DIFFERENT locks and both land here. Two concurrent `writeFile`s
    on one path each truncate at open, and a torn write is invalid JSON that
    `load()` swallows into `[]`: the user's entire run history, silently gone.
    `.then(fn, fn)` so a rejected write still advances the queue.
  */
  let queue: Promise<unknown> = Promise.resolve();

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

    save: (runs) => {
      // Serialised, and the payload is snapshotted before the wait so a later
      // mutation of the caller's array cannot change what this write emits.
      const state: StoredState = { version: 1, runs: trimRunsPerWorkflow(runs, getCap()) };
      const next = queue.then(async () => {
        try {
          await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
        } catch {
          // See `workflows-store.ts` — a read-only data dir is not fatal.
        }
      });
      queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
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
