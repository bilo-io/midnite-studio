// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain — no browser needed.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { notesManifest } from '@midnite/studio-feature-notes/main';
import { CHANNELS } from '@midnite/studio-shared';

import { registerMindHandlers } from './context';
import { MIND_KNOWLEDGE_CHANNELS } from './knowledge';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'mind-notes-'));
  dirs.push(dir);
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const on = new Map<string, (event: unknown, raw: unknown) => void>();
  const store = registerMindHandlers({
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: (c, l) => void on.set(c, l) },
    trashItem: async () => undefined,
    send: () => undefined,
    notesDirectory: dir,
    knowledgeCacheDirectory: join(dir, 'knowledge-cache'),
  });
  return { handlers, on, store };
}

describe('registerMindHandlers', () => {
  it('registers exactly the notes feature channels and the three Knowledge ones', async () => {
    const { handlers, on } = await setup();
    expect([...handlers.keys(), ...on.keys()].sort()).toEqual([...notesManifest.ipc, ...MIND_KNOWLEDGE_CHANNELS].sort());
    expect(new Set(on.keys())).toEqual(new Set([CHANNELS.notesSave, CHANNELS.notesDelete, CHANNELS.notesReorder]));
  });

  it('starts as an empty notebook and keeps what is saved, on disk', async () => {
    const { handlers, on, store } = await setup();
    expect(await handlers.get(CHANNELS.notesList)?.({}, undefined)).toEqual({ notes: [] });
    const note = { id: 'n1', repoId: 'mind', body: 'hi', status: 'captured', done: false, createdAt: 1, updatedAt: 1, order: 0 };
    on.get(CHANNELS.notesSave)?.({}, { note });
    await store.flush();
    expect(await handlers.get(CHANNELS.notesList)?.({}, { repoId: 'mind' })).toEqual({ notes: [note] });
  });

  it('captures into the one notebook and serves review cards from it', async () => {
    const { handlers } = await setup();
    const captured = (await handlers.get(CHANNELS.notesCapture)?.({}, { body: 'Q: why\nA: because' })) as { target: string };
    expect(captured.target).toBe('mind');
    const due = (await handlers.get(CHANNELS.notesReviewDue)?.({}, { repoId: 'mind' })) as { cards: { id: string }[]; total: number };
    expect(due.total).toBe(1);
    const graded = await handlers.get(CHANNELS.notesReviewGrade)?.({}, { repoId: 'mind', cardId: due.cards[0]?.id, grade: 'good' });
    expect(graded).toMatchObject({ ok: true });
  });
});
