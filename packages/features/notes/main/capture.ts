import { join } from 'node:path';

import { appDataDirectory, launcherInstalledFile, readInstalledApps } from '@midnite/studio-runtime';
import { INBOX_NOTEBOOK_ID, MIND_NOTEBOOK_ID, type Note } from '@midnite/studio-shared';

import { createNotesStore, type NotesStore } from './notes-store';

/**
 * Quick capture (Phase 113 Theme M): one thought in, and main decides where it lands.
 *
 * - The launcher's `installed.json` lists `mind` -> appended to Mind's notebook, through the same
 *   notes store code (so the file format is identical), rooted at Mind's data directory.
 * - Otherwise (not installed, no launcher state, a malformed file) -> the local Inbox notebook
 *   in the caller's own store, created by the first capture.
 *
 * The renderer only ever hears `'mind' | 'inbox'`; no path crosses the boundary.
 */
export type CaptureTarget = 'mind' | 'inbox';
export type CaptureResult = { ok: boolean; target: CaptureTarget; noteId?: string };

export function captureTarget(appData: string): CaptureTarget {
  return readInstalledApps(launcherInstalledFile(appData)).includes('mind') ? 'mind' : 'inbox';
}

export function createCapture(opts: {
  /** `app.getPath('appData')` — the base the launcher and every app's data directory hang off. */
  appData: string;
  /** The capturing app's own notes store (where an Inbox capture goes). */
  localStore: () => NotesStore;
  /** Test seams. */
  now?: () => number;
  newId?: () => string;
  openMindStore?: (directory: string) => NotesStore;
}): (body: string) => Promise<CaptureResult> {
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const open = opts.openMindStore ?? ((dir: string) => createNotesStore(dir));
  let mind: { dir: string; store: NotesStore } | null = null;

  return async (body) => {
    const text = body.trim();
    const target = captureTarget(opts.appData);
    if (text === '') return { ok: false, target };

    let store: NotesStore;
    let repoId: string;
    if (target === 'mind') {
      const dir = appDataDirectory(opts.appData, 'mind');
      if (mind?.dir !== dir) mind = { dir, store: open(dir) };
      store = mind.store;
      repoId = MIND_NOTEBOOK_ID;
    } else {
      store = opts.localStore();
      repoId = INBOX_NOTEBOOK_ID;
    }

    const existing = await store.list(repoId);
    const at = now();
    const note: Note = {
      id: newId(),
      repoId,
      body: text,
      status: 'captured',
      done: false,
      createdAt: at,
      updatedAt: at,
      // One below the notebook's minimum, so it lands on top like any new note.
      order: existing.length > 0 ? Math.min(...existing.map((n) => n.order)) - 1 : 0,
    };
    await store.save(note);
    await store.flush(repoId);
    return { ok: true, target, noteId: note.id };
  };
}

/** Where Mind's notebook file lives under an appData base — for tests that look at the disk. */
export function mindNotebookFile(appData: string): string {
  return join(appDataDirectory(appData, 'mind'), 'notes', `${MIND_NOTEBOOK_ID}.json`);
}
