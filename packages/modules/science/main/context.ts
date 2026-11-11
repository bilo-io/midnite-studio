import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import type { FeatureMainContext } from '@midnite/studio-runtime';
import { CHANNELS, SCIENCE_MOLECULE_MAX_BYTES, ScienceRequestSchema, type GitOpResult, type ScienceRequest } from '@midnite/studio-shared';

import { createNotebookStore, type NotebookStore } from './notebook-store';
import type { ScienceModuleServices } from './module';

/**
 * Electron's `dialog.showOpenDialog` shape, so the host passes `(o) => dialog.showOpenDialog(win, o)`
 * without this module importing `electron`.
 */
export type ShowOpenDialog = (opts: {
  properties: ['openFile'];
  filters: { name: string; extensions: string[] }[];
}) => Promise<{ canceled: boolean; filePaths: string[] }>;

/** Any op's answer: with a value, without one, or a failure. */
type ScienceResult = GitOpResult<unknown> | GitOpResult;

const FORMATS: Record<string, 'xyz' | 'pdb' | 'mol'> = { '.xyz': 'xyz', '.pdb': 'pdb', '.mol': 'mol', '.sdf': 'mol' };

/** The native picker for a structure file (Phase 126 Theme F.4): size-checked before reading; the renderer never sees the path. */
export async function importStructure(showOpenDialog: ShowOpenDialog | undefined): Promise<ScienceResult> {
  if (showOpenDialog === undefined) return { ok: false, kind: 'error', message: 'No file picker available' };
  try {
    const picked = await showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Structures', extensions: ['xyz', 'pdb', 'mol', 'sdf'] }] });
    const path = picked.filePaths[0];
    if (picked.canceled || path === undefined) return { ok: true, value: { cancelled: true } };
    const format = FORMATS[extname(path).toLowerCase()];
    if (format === undefined) return { ok: false, kind: 'error', message: 'Unsupported file type' };
    if ((await stat(path)).size > SCIENCE_MOLECULE_MAX_BYTES) return { ok: false, kind: 'error', message: 'Larger than 10 MB' };
    return { ok: true, value: { name: basename(path), format, text: await readFile(path, 'utf8') } };
  } catch (e) {
    return { ok: false, kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

async function dispatch(store: NotebookStore, services: ScienceModuleServices, req: ScienceRequest): Promise<ScienceResult> {
  switch (req.op) {
    case 'list':
      return store.list();
    case 'read':
      return store.read(req.id);
    case 'create':
      return store.create({ title: req.title, discipline: req.discipline, cells: req.cells });
    case 'write':
      return store.write(req.notebook);
    case 'rename':
      return store.rename(req.id, req.title);
    case 'remove':
      return store.remove(req.id);
    case 'importStructure':
      return importStructure(services.showOpenDialog);
  }
}

/** Registers the notebook channel (Phase 126 Theme B.4) over `<userData>/notebooks`. */
export function registerScienceOn(ctx: FeatureMainContext, services: ScienceModuleServices): NotebookStore {
  const store = createNotebookStore(join(services.userData, 'notebooks'), (path) => ctx.trashItem(path));
  ctx.ipc.handle(
    CHANNELS.science,
    ScienceRequestSchema,
    (req) => dispatch(store, services, req),
    (issue): ScienceResult => ({ ok: false, kind: 'error', message: issue }),
  );
  return store;
}
