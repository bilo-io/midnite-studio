import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Chat } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createChatStore } from './chat-store';

const chat = (id: string, extra: Partial<Chat> = {}): Chat => ({
  id,
  title: `chat ${id}`,
  engine: 'claude',
  model: null,
  mode: 'edit',
  repoId: null,
  repoName: null,
  repoPath: null,
  pinned: false,
  createdAt: 1,
  updatedAt: 2,
  messages: [{ id: 'm1', role: 'user', text: 'hi', createdAt: 1, status: 'done' }],
  session: null,
  ...extra,
});

describe('chat store', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'midnite-chat-store-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips a chat through one file per chat, under <userData>/chats', async () => {
    const store = createChatStore(dir);
    await store.save(chat('a'));
    await store.save(chat('b', { pinned: true }));

    expect(existsSync(join(dir, 'chats', 'a.json'))).toBe(true);
    const loaded = await createChatStore(dir).loadAll();
    expect(loaded.map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(loaded.find((c) => c.id === 'b')!.pinned).toBe(true);
    expect(loaded.find((c) => c.id === 'a')!.messages[0]!.text).toBe('hi');
  });

  it('overwrites on save and leaves no temp files behind', async () => {
    const store = createChatStore(dir);
    await store.save(chat('a', { title: 'one' }));
    await store.save(chat('a', { title: 'two' }));
    expect((await store.loadAll())[0]!.title).toBe('two');
    expect((await readdir(join(dir, 'chats'))).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('keeps concurrent saves of one chat in order', async () => {
    const store = createChatStore(dir);
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.save(chat('a', { title: `v${i}` }))));
    expect((await store.loadAll())[0]!.title).toBe('v9');
  });

  it('skips a corrupt or foreign file instead of losing the list', async () => {
    const store = createChatStore(dir);
    await store.save(chat('good'));
    await writeFile(join(dir, 'chats', 'bad.json'), '{ not json');
    await writeFile(join(dir, 'chats', 'foreign.json'), JSON.stringify({ version: 1, chat: { id: 1 } }));
    await writeFile(join(dir, 'chats', 'notes.txt'), 'ignore me');
    expect((await store.loadAll()).map((c) => c.id)).toEqual(['good']);
  });

  it('loads nothing from a directory that does not exist yet', async () => {
    expect(await createChatStore(join(dir, 'nope')).loadAll()).toEqual([]);
  });

  it('removes a chat', async () => {
    const store = createChatStore(dir);
    await store.save(chat('a'));
    await store.remove('a');
    expect(await store.loadAll()).toEqual([]);
    await expect(store.remove('a')).resolves.toBeUndefined();
  });

  it('cannot be steered out of its directory by a hostile id', async () => {
    const store = createChatStore(dir);
    await store.save(chat('../../escape'));
    expect(existsSync(join(dir, 'escape.json'))).toBe(false);
    expect((await readdir(join(dir, 'chats'))).some((n) => n.includes('escape'))).toBe(true);
  });

  it('stores patches beside the chats and reads them back', async () => {
    const store = createChatStore(dir);
    await store.savePatches('cs1', { 'a.ts': 'diff --git a/a.ts b/a.ts\n' });
    expect(await store.loadPatches('cs1')).toEqual({ 'a.ts': 'diff --git a/a.ts b/a.ts\n' });
    expect(await store.loadPatches('missing')).toBeNull();
    await store.removePatches(['cs1', 'never-existed']);
    expect(await store.loadPatches('cs1')).toBeNull();
  });

  it('treats a malformed patch file as missing', async () => {
    await mkdir(join(dir, 'chats', 'patches'), { recursive: true });
    await writeFile(join(dir, 'chats', 'patches', 'cs.json'), '[1,2]');
    expect(await createChatStore(dir).loadPatches('cs')).toBeNull();
  });
});
