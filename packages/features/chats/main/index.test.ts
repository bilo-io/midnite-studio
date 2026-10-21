// @vitest-environment node
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatsManifest } from '../manifest';
import { chatsMain } from './index';
import { createChatsRuntime } from './runtime';

describe('chats main', () => {
  let ctx: ReturnType<typeof createRecordingContext>;
  const emit = vi.fn();

  beforeEach(() => {
    emit.mockClear();
    // An in-memory store and no agents: no CLI is ever spawned and nothing touches disk.
    const runtime = createChatsRuntime(null, {
      agents: async () => [],
      resolveRepo: () => null,
      emit,
    });
    ctx = createRecordingContext();
    chatsMain.register(ctx, { runtime: () => runtime, repoPath: () => null, home: () => '/nonexistent-home' });
  });

  it('registers exactly the manifest channels', () => {
    expect([...ctx.channels].sort()).toEqual([...chatsManifest.ipc].sort());
  });

  it('creates a chat and lists it back over the wire', async () => {
    const created = (await ctx.invoke(CHANNELS.chatsCreate, { engine: 'claude' })) as {
      ok: boolean;
      value: { chat: { id: string; engine: string } };
    };
    expect(created.ok).toBe(true);
    const listed = (await ctx.invoke(CHANNELS.chatsList)) as { chats: { id: string }[] };
    expect(listed.chats.map((c) => c.id)).toContain(created.value.chat.id);
  });

  it('turns an invalid payload into a failure instead of throwing', async () => {
    expect(await ctx.invoke(CHANNELS.chatsCreate, { engine: '' })).toMatchObject({ ok: false, kind: 'error' });
  });

  it('answers a missing chat as a sentence, not an exception', async () => {
    expect(await ctx.invoke(CHANNELS.chatsGet, { id: 'does-not-exist' })).toMatchObject({ ok: false });
  });

  it('suggests no skills and no files for a repo-less chat with nothing on disk', async () => {
    expect(await ctx.invoke(CHANNELS.chatsSkills, { engine: 'claude', repoId: null })).toMatchObject({
      ok: true,
      value: { skills: [] },
    });
    expect(await ctx.invoke(CHANNELS.chatsFiles, { repoId: null, chatId: null })).toMatchObject({ ok: true });
  });
});
