import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  WORKFLOW_TEMPLATES,
  WorkflowTemplateSchema,
  failure,
  ok,
  type GitOpResult,
  type WorkflowTemplate,
} from '@midnite/studio-shared';

/**
 * User-saved workflow templates (Phase 97 Theme L) — the gallery's own
 * "Your templates" section, persisted globally under `userData` as one
 * `workflow-templates.json`, the same shape and the same per-entry
 * validation `workflows-store.ts` uses. The five built-ins never live here:
 * they are data in `shared`, and an id that collides with one is refused
 * rather than shadowing it.
 */
const FILE_NAME = 'workflow-templates.json';

export type WorkflowTemplatesStore = {
  load: () => Promise<WorkflowTemplate[]>;
  save: (templates: readonly WorkflowTemplate[]) => Promise<void>;
};

type StoredState = { version: 1; templates: unknown[] };

export function createWorkflowTemplatesStore(directory: string): WorkflowTemplatesStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        return [];
      }
      return parseStoredTemplates(raw);
    },

    save: async (templates) => {
      const state: StoredState = { version: 1, templates: [...templates] };
      try {
        await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir costs the user persistence, not the session.
      }
    },
  };
}

/** Exported for tests; drops one bad entry rather than the file. */
export function parseStoredTemplates(value: unknown): WorkflowTemplate[] {
  if (typeof value !== 'object' || value === null) return [];
  const templates = (value as { templates?: unknown }).templates;
  if (!Array.isArray(templates)) return [];

  const result: WorkflowTemplate[] = [];
  for (const entry of templates) {
    const parsed = WorkflowTemplateSchema.safeParse(entry);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

export const nullWorkflowTemplatesStore: WorkflowTemplatesStore = {
  load: async () => [],
  save: async () => {},
};

// --- service -----------------------------------------------------------------

let store: WorkflowTemplatesStore = nullWorkflowTemplatesStore;
let templates: WorkflowTemplate[] = [];
let loading: Promise<void> | null = null;

export function configureWorkflowTemplates(next: WorkflowTemplatesStore): void {
  store = next;
  templates = [];
  loading = null;
}

async function ensureLoaded(): Promise<void> {
  loading ??= (async () => {
    templates = await store.load();
  })();
  await loading;
}

const BUILT_IN_IDS = new Set(WORKFLOW_TEMPLATES.map((template) => template.id));

export async function listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  await ensureLoaded();
  return templates;
}

/** Upsert by id. A built-in's id is refused — a user template never shadows one. */
export async function saveWorkflowTemplate(next: WorkflowTemplate): Promise<GitOpResult<WorkflowTemplate>> {
  if (BUILT_IN_IDS.has(next.id)) return failure('That id belongs to a built-in template.');
  await ensureLoaded();
  const index = templates.findIndex((template) => template.id === next.id);
  templates = index === -1 ? [...templates, next] : templates.map((t) => (t.id === next.id ? next : t));
  await store.save(templates);
  return ok(next);
}

export async function deleteWorkflowTemplate(id: string): Promise<GitOpResult> {
  await ensureLoaded();
  if (!templates.some((template) => template.id === id)) return failure('That template no longer exists.');
  templates = templates.filter((template) => template.id !== id);
  await store.save(templates);
  return ok();
}
