import { join } from 'node:path';

import type { FeatureMainContext } from '@midnite/studio-runtime';
import { CHANNELS, ScienceRequestSchema, type GitOpResult, type ScienceRequest } from '@midnite/studio-shared';

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

async function dispatch(store: NotebookStore, req: ScienceRequest): Promise<ScienceResult> {
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
      // Theme F.
      return { ok: false, kind: 'error', message: 'Not available yet' };
  }
}

/** Registers the notebook channel (Phase 126 Theme B.4) over `<userData>/notebooks`. */
export function registerScienceOn(ctx: FeatureMainContext, services: ScienceModuleServices): NotebookStore {
  const store = createNotebookStore(join(services.userData, 'notebooks'), (path) => ctx.trashItem(path));
  ctx.ipc.handle(
    CHANNELS.science,
    ScienceRequestSchema,
    (req) => dispatch(store, req),
    (issue): ScienceResult => ({ ok: false, kind: 'error', message: issue }),
  );
  return store;
}
