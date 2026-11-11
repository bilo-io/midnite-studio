import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  BASE_SCENARIO_ID,
  STARTUP_WORKSPACE_VERSION,
  StartupWorkspaceSchema,
  type StartupResult,
  type StartupSnapshot,
  type StartupWorkspace,
} from '@midnite/studio-shared';

export const NEWER_VERSION_MESSAGE = 'This workspace was written by a newer Midnite Startup.';

export type MigrateResult =
  | { ok: true; workspace: StartupWorkspace }
  | { ok: false; reason: 'newer-version' | 'corrupt' };

/** The workspace every install starts from, "Base" scenario included: it always exists and cannot be removed. */
export function emptyWorkspace(): StartupWorkspace {
  return withBaseScenario(StartupWorkspaceSchema.parse({ version: STARTUP_WORKSPACE_VERSION }));
}

export function withBaseScenario(workspace: StartupWorkspace): StartupWorkspace {
  if (workspace.scenarios.some((s) => s.id === BASE_SCENARIO_ID)) return workspace;
  const base = { id: BASE_SCENARIO_ID, name: 'Base', costMultiplierBp: 10000, revenueMultiplierBp: 10000, extraLines: [] };
  return { ...workspace, scenarios: [base, ...workspace.scenarios] };
}

/** Version 1 is the identity; a version above it is read-only, and anything that fails the schema is corrupt. */
export function migrateWorkspace(raw: unknown): MigrateResult {
  const version = typeof raw === 'object' && raw !== null ? (raw as { version?: unknown }).version : undefined;
  if (typeof version === 'number' && Number.isInteger(version) && version > STARTUP_WORKSPACE_VERSION) return { ok: false, reason: 'newer-version' };
  const parsed = StartupWorkspaceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'corrupt' };
  return { ok: true, workspace: withBaseScenario(parsed.data) };
}

export type StartupFailure = Extract<StartupResult<never>, { ok: false }>;

/** What a mutation hands back: the next workspace, or a refusal that leaves the stored one untouched. */
export type Mutation = { ok: true; workspace: StartupWorkspace } | StartupFailure;

export type WorkspaceStore = {
  snapshot(): StartupSnapshot;
  /** Apply `change` to a copy of the workspace and persist it, one write at a time. */
  mutate(change: (current: StartupWorkspace) => Mutation): Promise<StartupResult<StartupSnapshot>>;
};

export type WorkspaceStoreOptions = {
  /** `<userData>/startup`. */
  dir: string;
  now?: () => number;
  warn?: (message: string) => void;
  /** Called after every successful write, with the new revision. */
  onChanged?: (revision: number) => void;
};

/**
 * The company's workspace as one JSON file, `<dir>/workspace.json`, written temp + rename through one promise
 * queue so two quick writes cannot interleave and a crash cannot leave half a file. Every write bumps the
 * revision. A file from a newer build opens read-only (writes answer `newer-version`); a file that fails the
 * schema is moved to `workspace.corrupt-<ts>.json` and an empty workspace starts. No lock file: Startup is
 * single-instance and nothing else opens this file.
 */
export async function openWorkspaceStore(options: WorkspaceStoreOptions): Promise<WorkspaceStore> {
  const now = options.now ?? Date.now;
  const file = join(options.dir, 'workspace.json');
  let current = emptyWorkspace();
  let revision = 0;
  let readOnly = false;
  let queue: Promise<unknown> = Promise.resolve();

  let text: string | null = null;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') options.warn?.(`startup: could not read workspace.json (${String(error)})`);
  }
  if (text !== null) {
    let raw: unknown;
    let parsedJson = true;
    try {
      raw = JSON.parse(text);
    } catch {
      parsedJson = false;
    }
    const migrated = parsedJson ? migrateWorkspace(raw) : ({ ok: false, reason: 'corrupt' } as const);
    if (migrated.ok) current = migrated.workspace;
    else if (migrated.reason === 'newer-version') readOnly = true;
    else {
      const aside = join(options.dir, `workspace.corrupt-${now()}.json`);
      await rename(file, aside).catch((error: unknown) => options.warn?.(`startup: could not move a corrupt workspace aside (${String(error)})`));
      options.warn?.(`startup: workspace.json did not parse; moved to ${aside}`);
    }
  }

  async function persist(next: StartupWorkspace): Promise<void> {
    await mkdir(options.dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
    await rename(tmp, file);
  }

  const snapshot = (): StartupSnapshot => ({ workspace: current, revision, readOnly });

  return {
    snapshot,
    mutate(change) {
      const run = async (): Promise<StartupResult<StartupSnapshot>> => {
        if (readOnly) return { ok: false, kind: 'newer-version', message: NEWER_VERSION_MESSAGE };
        const result = change(structuredClone(current));
        if (!result.ok) return result;
        try {
          await persist(result.workspace);
        } catch (error) {
          return { ok: false, kind: 'io', message: `Could not save the workspace: ${error instanceof Error ? error.message : String(error)}` };
        }
        current = result.workspace;
        revision += 1;
        options.onChanged?.(revision);
        return { ok: true, value: snapshot() };
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
