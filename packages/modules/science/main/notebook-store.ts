import { createJsonDirStore, type JsonDirStore } from '@midnite/studio-runtime';
import {
  migrateScienceNotebook,
  type GitOpResult,
  type ScienceCell,
  type ScienceDiscipline,
  type ScienceNotebook,
  type ScienceNotebookSummary,
} from '@midnite/studio-shared';

const fail = (message: string): GitOpResult<never> => ({ ok: false, kind: 'error', message });
const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export type NotebookStore = {
  list(): Promise<GitOpResult<{ notebooks: ScienceNotebookSummary[]; quarantined: number }>>;
  read(id: string): Promise<GitOpResult<{ notebook: ScienceNotebook }>>;
  create(input: { title: string; discipline: ScienceDiscipline; cells: ScienceCell[] }): Promise<GitOpResult<{ notebook: ScienceNotebook }>>;
  write(notebook: ScienceNotebook): Promise<GitOpResult<{ updatedAt: string }>>;
  rename(id: string, title: string): Promise<GitOpResult>;
  remove(id: string): Promise<GitOpResult>;
};

/**
 * The notebook store (Phase 126 Theme B.3b): one `<dir>/nb-<id>.json` per notebook over the runtime's JSON
 * directory store. Nothing throws across the channel; `remove` goes to the OS Trash, never `unlink`.
 */
export function createNotebookStore(dir: string, trashItem: (path: string) => Promise<void>): NotebookStore {
  const store: JsonDirStore<ScienceNotebook> = createJsonDirStore<ScienceNotebook>({
    dir,
    prefix: 'nb-',
    idPattern: /^nb-[a-z0-9]{12}$/,
    parse: migrateScienceNotebook,
  });

  return {
    async list() {
      try {
        const { items, quarantined } = await store.list();
        const notebooks = items.map((n) => ({ id: n.id, title: n.title, discipline: n.discipline, updatedAt: n.updatedAt, cellCount: n.cells.length }));
        return { ok: true, value: { notebooks, quarantined } };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
    async read(id) {
      try {
        const notebook = await store.read(id);
        return notebook === null ? fail('Notebook not found') : { ok: true, value: { notebook } };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
    async create(input) {
      try {
        const now = new Date().toISOString();
        const notebook: ScienceNotebook = {
          version: 1,
          id: store.mintId(),
          title: input.title,
          discipline: input.discipline,
          createdAt: now,
          updatedAt: now,
          cells: input.cells,
        };
        await store.write(notebook);
        return { ok: true, value: { notebook } };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
    async write(notebook) {
      try {
        // `create` is the only way a file appears.
        if (!(await store.exists(notebook.id))) return fail('Notebook not found');
        const updatedAt = new Date().toISOString();
        await store.write({ ...notebook, updatedAt });
        return { ok: true, value: { updatedAt } };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
    async rename(id, title) {
      try {
        const notebook = await store.read(id);
        if (notebook === null) return fail('Notebook not found');
        await store.write({ ...notebook, title, updatedAt: new Date().toISOString() });
        return { ok: true };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
    async remove(id) {
      try {
        if (!(await store.exists(id))) return fail('Notebook not found');
        await trashItem(store.pathOf(id));
        return { ok: true };
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
  };
}
