import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TempRepo } from '@midnite/studio-git-engine';
import type { AgentDefinition, Chat, ChatEvent } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createChatService } from './chat-service';
import { createMemoryChatStore } from './chat-store';

/**
 * End to end with a real CLI process and a real repo: a fake `claude` shell
 * script that streams stream-json, edits files in its working directory and
 * exits. Proves the property the whole feature rests on — the agent's edits
 * land in a throwaway copy, the user's working tree is untouched until accept,
 * and an accept applies exactly what was accepted.
 */
describe('chats against a fake CLI and a real repo', () => {
  let repo: TempRepo;
  let scratch: string;
  let cli: string;

  beforeEach(async () => {
    repo = await TempRepo.create();
    await repo.commitFile('a.txt', 'one\ntwo\nthree\n', 'add a');
    await repo.writeFile('uncommitted.txt', 'mine\n');
    scratch = await mkdtemp(join(tmpdir(), 'midnite-chats-int-'));
    cli = join(scratch, 'fake-claude.sh');
    await writeFile(
      cli,
      [
        '#!/bin/sh',
        'echo \'{"type":"system","subtype":"init","session_id":"fake-1"}\'',
        'echo \'{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Edited "}}}\'',
        '# the user\'s uncommitted file must be visible in the sandbox',
        'cat uncommitted.txt > saw-uncommitted.txt',
        'printf \'one\\nTWO\\nthree\\n\' > a.txt',
        'printf \'brand new\\n\' > created.txt',
        'echo \'{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"two files."}}}\'',
        'echo \'{"type":"result","subtype":"success","is_error":false,"result":"Edited two files.","session_id":"fake-1"}\'',
        '',
      ].join('\n'),
    );
    await chmod(cli, 0o755);
  });

  afterEach(async () => {
    await repo.cleanup();
    await rm(scratch, { recursive: true, force: true });
  });

  function make() {
    const events: ChatEvent[] = [];
    const agent: AgentDefinition = { id: 'claude', label: 'Fake Claude', command: cli, args: [], accent: '#fff' };
    const service = createChatService({
      store: createMemoryChatStore(),
      agents: async () => [agent],
      resolveRepo: (id) => (id === 'r' ? { id, path: repo.path, name: 'proj' } : null),
      emit: (e) => events.push(e),
      sandboxRoot: join(scratch, 'sandboxes'),
      scratchRoot: join(scratch, 'scratch'),
    });
    return { service, events };
  }

  async function turn() {
    const ctx = make();
    const created = await ctx.service.create({ engine: 'claude', model: null, mode: 'edit', repoId: 'r' });
    if (!created.ok) throw new Error('create failed');
    const chat = created.value.chat;
    await ctx.service.send({ chatId: chat.id, text: 'Change two to TWO and add created.txt' });
    await ctx.service.idle();
    const got = (await ctx.service.get(chat.id)) as { value: { chat: Chat } };
    const reply = got.value.chat.messages[1]!;
    return { ...ctx, chat, reply };
  }

  it('streams the text, and leaves the real working tree exactly as it was', async () => {
    const before = await repo.git(['status', '--porcelain']);
    const { reply, events, chat } = await turn();

    expect(reply).toMatchObject({ status: 'done', text: 'Edited two files.' });
    expect(events.filter((e) => e.kind === 'delta').map((e) => (e as { text: string }).text)).toEqual(['Edited ', 'two files.']);
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('one\ntwo\nthree\n');
    expect(existsSync(join(repo.path, 'created.txt'))).toBe(false);
    expect(await repo.git(['status', '--porcelain'])).toBe(before);
    expect(existsSync(join(scratch, 'sandboxes', chat.id))).toBe(false);
  });

  it('captures only what the agent changed — not the uncommitted state it started from', async () => {
    const { reply } = await turn();
    const set = reply.changeSet!;
    expect(set.status).toBe('pending');
    // `saw-uncommitted.txt` proves the sandbox held the user's uncommitted file; it is the agent's own new file.
    expect(set.files.map((f) => f.path).sort()).toEqual(['a.txt', 'created.txt', 'saw-uncommitted.txt']);
    expect(set.files.find((f) => f.path === 'a.txt')).toMatchObject({ change: 'modified', insertions: 1, deletions: 1 });
    expect(set.files.find((f) => f.path === 'created.txt')).toMatchObject({ change: 'added' });
  });

  it('accept applies exactly the accepted files; reject leaves the rest out; both are persisted', async () => {
    const { service, chat, reply } = await turn();
    const id = reply.changeSet!.id;

    const res = await service.resolveChanges({
      chatId: chat.id,
      changeSetId: id,
      decisions: [
        { path: 'a.txt', action: 'accept' },
        { path: 'created.txt', action: 'reject' },
        { path: 'saw-uncommitted.txt', action: 'reject' },
      ],
    });

    expect(res.ok).toBe(true);
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('one\nTWO\nthree\n');
    expect(existsSync(join(repo.path, 'created.txt'))).toBe(false);
    expect(await repo.git(['status', '--porcelain'])).toContain(' M a.txt');
    const after = (await service.get(chat.id)) as { value: { chat: Chat } };
    expect(after.value.chat.messages[1]!.changeSet).toMatchObject({ status: 'partial' });
  });

  it('answers a conflict when the user edited the same line meanwhile, and leaves their edit alone', async () => {
    const { service, chat, reply } = await turn();
    await repo.writeFile('a.txt', 'one\nmy own change\nthree\n');

    const res = await service.resolveChanges({
      chatId: chat.id,
      changeSetId: reply.changeSet!.id,
      decisions: [{ path: 'a.txt', action: 'accept' }],
    });

    expect(res).toEqual({ ok: false, kind: 'conflict', files: ['a.txt'], op: 'change-apply' });
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('one\nmy own change\nthree\n');
    const after = (await service.get(chat.id)) as { value: { chat: Chat } };
    expect(after.value.chat.messages[1]!.changeSet!.files.find((f) => f.path === 'a.txt')).toMatchObject({ status: 'conflict' });
  });

  it('Stop kills the real process group and leaves the tree and sandbox clean', async () => {
    const slow = join(scratch, 'slow.sh');
    await writeFile(
      slow,
      ['#!/bin/sh', 'echo \'{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"working"}}}\'', 'printf x > half-done.txt', 'sleep 30', ''].join('\n'),
    );
    await chmod(slow, 0o755);
    const events: ChatEvent[] = [];
    const service = createChatService({
      store: createMemoryChatStore(),
      agents: async () => [{ id: 'claude', label: 'Slow', command: slow, args: [], accent: '#fff' }],
      resolveRepo: () => ({ id: 'r', path: repo.path, name: 'proj' }),
      emit: (e) => events.push(e),
      sandboxRoot: join(scratch, 'sandboxes'),
      scratchRoot: join(scratch, 'scratch'),
    });
    const created = await service.create({ engine: 'claude', model: null, mode: 'edit', repoId: 'r' });
    if (!created.ok) throw new Error('create failed');
    await service.send({ chatId: created.value.chat.id, text: 'go' });
    for (let i = 0; i < 100 && !events.some((e) => e.kind === 'delta'); i += 1) await new Promise((r) => setTimeout(r, 20));

    const started = Date.now();
    await service.cancel(created.value.chat.id);
    await service.idle();

    const got = (await service.get(created.value.chat.id)) as { value: { chat: Chat } };
    expect(got.value.chat.messages[1]).toMatchObject({ status: 'cancelled', text: 'working' });
    expect(got.value.chat.messages[1]!.changeSet).toBeUndefined();
    // Killed, not waited out: far under the script's 30 s sleep (a generous bound, not a timing assertion on speed).
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(existsSync(join(repo.path, 'half-done.txt'))).toBe(false);
    expect(existsSync(join(scratch, 'sandboxes', created.value.chat.id))).toBe(false);
  });
});
