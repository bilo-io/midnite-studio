import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { WorkflowSchema, type Workflow } from '@midnite/studio-shared';

/**
 * Workflows, persisted globally under Electron's `userData` — one
 * `workflows.json`, the same shape `councils-store.ts` uses, for the same
 * reason: a workflow is not scoped to a repository, so there is nothing to key
 * it by.
 *
 * App-owned, so there is no "builtin defaults merged with overrides" step.
 * Entries validate individually on load — one malformed workflow (a hand
 * corruption, a schema change) costs the user that workflow and nothing else in
 * the file.
 */
const FILE_NAME = 'workflows.json';

export type WorkflowsStore = {
  load: () => Promise<Workflow[]>;
  save: (workflows: readonly Workflow[]) => Promise<void>;
};

type StoredState = { version: 1; workflows: unknown[] };

export function createWorkflowsStore(directory: string): WorkflowsStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        // Missing (first launch) or unreadable — start with none.
        return [];
      }
      return parseStoredWorkflows(raw);
    },

    save: async (workflows) => {
      const state: StoredState = { version: 1, workflows: [...workflows] };
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
export function parseStoredWorkflows(value: unknown): Workflow[] {
  if (typeof value !== 'object' || value === null) return [];
  const workflows = (value as { workflows?: unknown }).workflows;
  if (!Array.isArray(workflows)) return [];

  const result: Workflow[] = [];
  for (const entry of workflows) {
    const parsed = WorkflowSchema.safeParse(entry);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

/** A store that remembers nothing — the fallback before one is configured. */
export const nullWorkflowsStore: WorkflowsStore = {
  load: async () => [],
  save: async () => {},
};
