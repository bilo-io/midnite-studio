import { createJsonDirStore, type JsonDirStore } from '@midnite/studio-runtime';
import {
  migrateSimScenario,
  SIM_SCENARIO_MAX_BYTES,
  type GitOpResult,
  type SimKind,
  type SimScenario,
  type SimScenarioDraft,
  type SimScenarioSummary,
} from '@midnite/studio-shared';

const fail = (message: string): GitOpResult<never> => ({ ok: false, kind: 'error', message });
const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export type ScenarioStore = {
  list(kind?: SimKind): Promise<GitOpResult<{ scenarios: SimScenarioSummary[]; quarantined: number }>>;
  read(id: string): Promise<GitOpResult<{ scenario: SimScenario }>>;
  save(input: { id?: string; scenario: SimScenarioDraft }): Promise<GitOpResult<{ scenario: SimScenario }>>;
  rename(id: string, title: string): Promise<GitOpResult>;
  remove(id: string): Promise<GitOpResult>;
};

/**
 * The scenario store (Phase 127 Theme F.2): one `<dir>/sim-<id>.json` per scenario over the runtime's JSON
 * directory store. Nothing throws across the channel; `remove` goes to the OS Trash, never `unlink`.
 */
export function createScenarioStore(dir: string, trashItem: (path: string) => Promise<void>): ScenarioStore {
  const store: JsonDirStore<SimScenario> = createJsonDirStore<SimScenario>({
    dir,
    prefix: 'sim-',
    idPattern: /^sim-[a-z0-9]{12}$/,
    parse: migrateSimScenario,
  });

  return {
    async list(kind) {
      try {
        const { items, quarantined } = await store.list();
        const scenarios = items
          .filter((s) => kind === undefined || s.kind === kind)
          .map((s) => ({ id: s.id, kind: s.kind, title: s.title, updatedAt: s.updatedAt }))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return { ok: true, value: { scenarios, quarantined } };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
    async read(id) {
      try {
        const scenario = await store.read(id);
        return scenario === null ? fail('Scenario not found') : { ok: true, value: { scenario } };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
    async save({ id, scenario: draft }) {
      try {
        const now = new Date().toISOString();
        const previous = id === undefined ? null : await store.read(id);
        if (id !== undefined && previous === null) return fail('Scenario not found');
        const scenario: SimScenario = {
          version: 1,
          id: previous?.id ?? store.mintId(),
          kind: draft.kind,
          title: draft.title,
          seed: draft.seed,
          params: draft.params,
          ...(draft.state === undefined ? {} : { state: draft.state }),
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        };
        if (Buffer.byteLength(JSON.stringify(scenario), 'utf8') > SIM_SCENARIO_MAX_BYTES) return fail('Scenario is larger than 8 MB');
        await store.write(scenario);
        return { ok: true, value: { scenario } };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
    async rename(id, title) {
      try {
        const scenario = await store.read(id);
        if (scenario === null) return fail('Scenario not found');
        await store.write({ ...scenario, title, updatedAt: new Date().toISOString() });
        return { ok: true };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
    async remove(id) {
      try {
        if (!(await store.exists(id))) return fail('Scenario not found');
        await trashItem(store.pathOf(id));
        return { ok: true };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
  };
}
