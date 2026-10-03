import { ok, type AgentDefinition, type Chat, type ChatEvent, type ChatMessage } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpawnedProcess, SpawnFn } from '../process-runner';
import { createMemoryChatStore } from './chat-store';
import { createChatService, type ChatServiceDeps, type GitSeam } from './chat-service';

/**
 * The chat service against a fake CLI: a `SpawnFn` that plays back scripted
 * stdout, plus a memory store and a recording emitter. No process, no disk.
 */

const claude: AgentDefinition = { id: 'claude', label: 'Claude Code', command: 'claude', args: [], accent: '#c96' };
const codex: AgentDefinition = { id: 'codex', label: 'Codex', command: 'codex', args: [], accent: '#fff' };

type Io = { out: (text: string) => void; err: (text: string) => void; close: (code: number | null) => void; killed: () => boolean };
type Call = { command: string; args: readonly string[]; cwd: string; killed: boolean };

function fakeSpawn(plan: (call: Call, io: Io, n: number) => void | Promise<void>): SpawnFn & { calls: Call[] } {
  const calls: Call[] = [];
  const spawn = ((command: string, args: readonly string[], cwd: string): SpawnedProcess => {
    const call: Call = { command, args, cwd, killed: false };
    calls.push(call);
    const stdout: ((c: string) => void)[] = [];
    const stderr: ((c: string) => void)[] = [];
    const closers: ((code: number | null) => void)[] = [];
    let closed = false;
    const close = (code: number | null) => {
      if (closed) return;
      closed = true;
      closers.forEach((h) => h(code));
    };
    const io: Io = {
      out: (t) => stdout.forEach((h) => h(t)),
      err: (t) => stderr.forEach((h) => h(t)),
      close,
      killed: () => call.killed,
    };
    setTimeout(() => void plan(call, io, calls.length), 0);
    return {
      onStdout: (h) => void stdout.push(h),
      onStderr: (h) => void stderr.push(h),
      onError: () => {},
      onClose: (h) => void closers.push(h),
      kill: () => {
        call.killed = true;
        close(null);
      },
    };
  }) as SpawnFn & { calls: Call[] };
  spawn.calls = calls;
  return spawn;
}

const line = (value: unknown): string => `${JSON.stringify(value)}\n`;
const textDelta = (text: string) => line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
const thinkingDelta = (thinking: string) =>
  line({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking } } });
const init = (id: string) => line({ type: 'system', subtype: 'init', session_id: id });
const done = (id: string) => line({ type: 'result', subtype: 'success', is_error: false, result: '', session_id: id });

/** A git seam whose worktrees exist only in a set — `disk` is that set. */
function fakeGit(over: Partial<GitSeam> = {}): GitSeam & { disk: Set<string> } {
  const disk = new Set<string>();
  const seam = {
    createAgentWorktree: vi.fn(async (_repo: string, wt: { path: string; branch: string }) => {
      disk.add(wt.path);
      return ok({ ...wt, seeded: true });
    }),
    reattachAgentWorktree: vi.fn(async (_repo: string, wt: { path: string; branch: string }) => {
      disk.add(wt.path);
      return ok(wt);
    }),
    removeAgentWorktree: vi.fn(async (_repo: string, wt: { path: string }) => {
      disk.delete(wt.path);
      return ok({ branchKept: false });
    }),
    branchExists: vi.fn(async () => true),
    snapshotTree: vi.fn(async () => ok('tree-at-start')),
    captureChanges: vi.fn(async () => ok([])),
    applyFilePatches: vi.fn(async (_repo: string, patches: readonly { path: string }[]) => patches.map((p) => ({ path: p.path, ok: true as const }))),
    exists: vi.fn((path: string) => disk.has(path)),
    ...over,
  };
  return Object.assign(seam as unknown as GitSeam, { disk });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setup(overrides: Partial<ChatServiceDeps> = {}) {
  const store = createMemoryChatStore();
  const events: ChatEvent[] = [];
  const deps: ChatServiceDeps = {
    store,
    agents: async () => [claude, codex],
    resolveRepo: (id) => (id === 'repo:/work/app' ? { id, path: '/work/app', name: 'app' } : null),
    emit: (e) => events.push(e),
    sandboxRoot: '/sbx',
    scratchRoot: '/tmp/midnite-chats-test-scratch',
    git: fakeGit(),
    ...overrides,
  };
  const service = createChatService(deps);
  return { service, store, events, deps };
}

const created = async (service: ReturnType<typeof setup>['service'], extra: Record<string, unknown> = {}): Promise<Chat> => {
  const res = await service.create({ engine: 'claude', model: null, mode: 'ask', repoId: null, ...extra });
  if (!res.ok) throw new Error('create failed');
  return res.value.chat;
};

const lastAssistant = (chat: Chat): ChatMessage => [...chat.messages].reverse().find((m) => m.role === 'assistant')!;

describe('chat service: streaming a turn', () => {
  it('streams deltas to the renderer, settles the message, titles the chat and keeps the session', async () => {
    const spawn = fakeSpawn(async (_c, io) => {
      io.out(init('sess-1'));
      io.out(textDelta('Hello'));
      io.out(textDelta(' world'));
      io.out(done('sess-1'));
      io.close(0);
    });
    const { service, events, store } = setup({ spawn });
    const chat = await created(service);

    const sent = await service.send({ chatId: chat.id, text: 'Say hello to the world' });
    expect(sent.ok).toBe(true);
    await service.idle();

    const after = (await service.get(chat.id)) as { ok: true; value: { chat: Chat } };
    const reply = lastAssistant(after.value.chat);
    expect(reply).toMatchObject({ text: 'Hello world', status: 'done', engine: 'claude' });
    expect(after.value.chat.title).toBe('Say hello to the world');
    expect(after.value.chat.session).toMatchObject({ engine: 'claude', id: 'sess-1' });

    const deltas = events.filter((e) => e.kind === 'delta').map((e) => (e as { text: string }).text);
    expect(deltas.join('')).toBe('Hello world');
    // user + assistant on start, assistant again on settle
    expect(events.filter((e) => e.kind === 'message')).toHaveLength(3);
    expect((await store.loadAll())[0]!.messages).toHaveLength(2);
  });

  it('runs claude with streaming flags, read-only in ask mode, in the scratch dir when there is no repo', async () => {
    const spawn = fakeSpawn(async (_c, io) => {
      io.out(textDelta('ok'));
      io.close(0);
    });
    const { service } = setup({ spawn });
    const chat = await created(service);
    await service.send({ chatId: chat.id, text: 'hi' });
    await service.idle();
    const call = spawn.calls[0]!;
    expect(call.command).toBe('claude');
    expect(call.args).toEqual(expect.arrayContaining(['-p', 'stream-json', '--include-partial-messages', 'plan']));
    expect(call.cwd).toContain(chat.id);
  });

  it('records an error when the CLI exits non-zero, with the first stderr line', async () => {
    const spawn = fakeSpawn(async (_c, io) => {
      io.err('boom: not logged in\nmore\n');
      io.close(2);
    });
    const { service } = setup({ spawn });
    const chat = await created(service);
    await service.send({ chatId: chat.id, text: 'hi' });
    await service.idle();
    const reply = lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat);
    expect(reply.status).toBe('error');
    expect(reply.error).toMatch(/Claude Code exited with an error: boom: not logged in/);
  });

  it('treats a CLI that answers nothing as an error rather than a blank reply', async () => {
    const spawn = fakeSpawn(async (_c, io) => io.close(0));
    const { service } = setup({ spawn });
    const chat = await created(service);
    await service.send({ chatId: chat.id, text: 'hi' });
    await service.idle();
    expect(lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat)).toMatchObject({
      status: 'error',
      error: 'The agent answered with nothing.',
    });
  });

  it('refuses an engine that is not on the roster, and one with no print mode', async () => {
    const { service } = setup({ spawn: fakeSpawn(async (_c, io) => io.close(0)), agents: async () => [claude] });
    const missing = await created(service, { engine: 'nope' });
    await service.send({ chatId: missing.id, text: 'hi' });
    await service.idle();
    expect(lastAssistant(((await service.get(missing.id)) as { value: { chat: Chat } }).value.chat).error).toMatch(/not on the agent roster/);
  });

  it('rejects an empty message and a second send while the first is still answering', async () => {
    const spawn = fakeSpawn(async () => {
      /* never closes until killed */
    });
    const { service } = setup({ spawn });
    const chat = await created(service);
    expect((await service.send({ chatId: chat.id, text: '   ' })).ok).toBe(false);
    expect((await service.send({ chatId: chat.id, text: 'one' })).ok).toBe(true);
    const second = await service.send({ chatId: chat.id, text: 'two' });
    expect(second).toMatchObject({ ok: false, kind: 'error' });
    await service.cancel(chat.id);
    await service.idle();
  });
});

describe('chat service: stop', () => {
  it('kills the process, keeps the text so far, marks the message cancelled', async () => {
    const spawn = fakeSpawn(async (_c, io) => {
      io.out(textDelta('partial'));
      // then hang
    });
    const { service, deps } = setup({ spawn });
    const chat = await created(service, { mode: 'edit', repoId: 'repo:/work/app' });
    await service.send({ chatId: chat.id, text: 'do a big thing' });
    await sleep(30);
    expect(((await service.list())[0]!).running).toBe(true);

    await service.cancel(chat.id);
    await service.idle();

    expect(spawn.calls[0]!.killed).toBe(true);
    const reply = lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat);
    expect(reply).toMatchObject({ status: 'cancelled', text: 'partial' });
    expect(reply.changeSet).toBeUndefined();
    expect(((await service.list())[0]!).running).toBe(false);
  });

  it('a stop that lands while the worktree is still being made never starts the CLI', async () => {
    const spawn = fakeSpawn(async (_c, io) => io.close(0));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service } = setup({
      spawn,
      git: fakeGit({
        createAgentWorktree: vi.fn(async (_r: string, wt: { path: string; branch: string }) => {
          await gate;
          return ok({ ...wt, seeded: true });
        }),
      }),
    });
    const chat = await created(service, { mode: 'edit', repoId: 'repo:/work/app' });
    await service.send({ chatId: chat.id, text: 'hi' });
    await service.cancel(chat.id);
    release();
    await service.idle();
    expect(spawn.calls).toHaveLength(0);
    expect(lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat).status).toBe('cancelled');
  });

  it('cancelling a chat that is not running is a no-op', async () => {
    const { service } = setup({ spawn: fakeSpawn(async () => {}) });
    const chat = await created(service);
    expect(await service.cancel(chat.id)).toEqual({ ok: true });
  });
});

describe('chat service: multi-turn', () => {
  it('resumes the CLI session on the next turn', async () => {
    const spawn = fakeSpawn(async (_c, io, n) => {
      io.out(init('sess-A'));
      io.out(textDelta(`answer ${n}`));
      io.close(0);
    });
    const { service } = setup({ spawn });
    const chat = await created(service);
    await service.send({ chatId: chat.id, text: 'one' });
    await service.idle();
    await service.send({ chatId: chat.id, text: 'two' });
    await service.idle();

    expect(spawn.calls[0]!.args).not.toContain('--resume');
    expect(spawn.calls[1]!.args).toEqual(expect.arrayContaining(['--resume', 'sess-A']));
    // resumed: only the new message is sent
    expect(spawn.calls[1]!.args[spawn.calls[1]!.args.length - 1]).toBe('two');
  });

  it('retries once with a transcript replay when the resumed session is gone', async () => {
    const spawn = fakeSpawn(async (call, io, n) => {
      if (n === 1) {
        io.out(init('sess-A'));
        io.out(textDelta('first'));
        io.close(0);
      } else if (call.args.includes('--resume')) {
        io.err('No conversation found with session ID sess-A\n');
        io.close(1);
      } else {
        io.out(textDelta('recovered'));
        io.close(0);
      }
    });
    const { service } = setup({ spawn });
    const chat = await created(service);
    await service.send({ chatId: chat.id, text: 'one' });
    await service.idle();
    await service.send({ chatId: chat.id, text: 'two' });
    await service.idle();

    expect(spawn.calls).toHaveLength(3);
    const replay = spawn.calls[2]!.args[spawn.calls[2]!.args.length - 1]!;
    expect(replay).toContain('<conversation>');
    expect(replay).toContain('User:\none');
    const reply = lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat);
    expect(reply).toMatchObject({ status: 'done', text: 'recovered' });
  });

  it('does not resume across a changed engine, and replays the transcript instead', async () => {
    const spawn = fakeSpawn(async (_c, io) => {
      io.out(init('sess-A'));
      io.out(textDelta('hi'));
      io.close(0);
    });
    const { service } = setup({ spawn });
    const chat = await created(service);
    await service.send({ chatId: chat.id, text: 'one' });
    await service.idle();
    const updated = await service.update({ id: chat.id, engine: 'codex' });
    expect(updated).toMatchObject({ ok: true });
    expect((updated as { value: { chat: Chat } }).value.chat.session).toBeNull();
    await service.send({ chatId: chat.id, text: 'two' });
    await service.idle();
    expect(spawn.calls[1]!.command).toBe('codex');
    expect(spawn.calls[1]!.args[spawn.calls[1]!.args.length - 1]).toContain('<conversation>');
  });

  it('edit rewinds the thread to that message, drops what followed and its stored patches, and forgets the session', async () => {
    const spawn = fakeSpawn(async (_c, io, n) => {
      io.out(init(`s${n}`));
      io.out(textDelta(`a${n}`));
      io.close(0);
    });
    const { service, store } = setup({ spawn });
    const chat = await created(service);
    await service.send({ chatId: chat.id, text: 'one' });
    await service.idle();
    await service.send({ chatId: chat.id, text: 'two' });
    await service.idle();
    const thread = ((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat;
    const first = thread.messages[0]!;
    store.patches.set('cs-old', { 'x.ts': 'patch' });
    thread.messages[3]!.changeSet = { id: 'cs-old', createdAt: 1, status: 'pending', files: [] };

    await service.send({ chatId: chat.id, fromMessageId: first.id, text: 'one, rewritten' });
    await service.idle();

    const after = ((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat;
    expect(after.messages.map((m) => m.text)).toEqual(['one, rewritten', 'a3']);
    expect(store.patches.has('cs-old')).toBe(false);
    // The rewound thread must not be resumed: the engine still remembers the dropped turns.
    expect(spawn.calls[2]!.args).not.toContain('--resume');
  });

  it('retry re-sends the same user message', async () => {
    const spawn = fakeSpawn(async (_c, io, n) => {
      io.out(textDelta(`try ${n}`));
      io.close(0);
    });
    const { service } = setup({ spawn });
    const chat = await created(service);
    await service.send({ chatId: chat.id, text: 'question' });
    await service.idle();
    const userId = ((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat.messages[0]!.id;
    await service.send({ chatId: chat.id, fromMessageId: userId });
    await service.idle();
    const after = ((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat;
    expect(after.messages.map((m) => m.text)).toEqual(['question', 'try 2']);
  });

  it('refuses to rewind to an assistant message or an unknown one', async () => {
    const { service } = setup({ spawn: fakeSpawn(async (_c, io) => (io.out(textDelta('x')), io.close(0))) });
    const chat = await created(service);
    await service.send({ chatId: chat.id, text: 'q' });
    await service.idle();
    const assistantId = lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat).id;
    expect((await service.send({ chatId: chat.id, fromMessageId: assistantId })).ok).toBe(false);
    expect((await service.send({ chatId: chat.id, fromMessageId: 'zzz' })).ok).toBe(false);
  });
});

describe('chat service: edit mode and reviewable changes', () => {
  const captured = [
    {
      path: 'src/a.ts',
      oldPath: null,
      change: 'modified',
      binary: false,
      insertions: 2,
      deletions: 1,
      patch: 'PATCH',
      hunks: [
        { header: '@@ -1,2 +1,3 @@', insertions: 1, deletions: 0, text: '@@ -1,2 +1,3 @@\n a\n+b\n c\n' },
        { header: '@@ -20,2 +21,3 @@', insertions: 1, deletions: 1, text: '@@ -20,2 +21,3 @@\n-x\n+y\n z\n' },
      ],
      diff: {},
    },
    { path: 'img.png', oldPath: null, change: 'added', binary: true, insertions: 0, deletions: 0, patch: 'BIN', hunks: [], diff: {} },
  ];

  const header = 'diff --git a/src/a.ts b/src/a.ts\nindex 1..2 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n';
  const fullPatch = `${header}@@ -1,2 +1,3 @@\n a\n+b\n c\n@@ -20,2 +21,3 @@\n-x\n+y\n z\n`;

  async function withChanges() {
    const spawn = fakeSpawn(async (_c, io) => {
      io.out(textDelta('I updated a.ts'));
      io.close(0);
    });
    const ctx = setup({
      spawn,
      git: fakeGit({
        captureChanges: vi.fn(async () => ok(captured.map((f) => (f.path === 'src/a.ts' ? { ...f, patch: fullPatch } : f)))) as never,
      }),
    });
    const chat = await created(ctx.service, { mode: 'edit', repoId: 'repo:/work/app' });
    await ctx.service.send({ chatId: chat.id, text: 'update a.ts' });
    await ctx.service.idle();
    const message = lastAssistant(((await ctx.service.get(chat.id)) as { value: { chat: Chat } }).value.chat);
    return { ...ctx, chat, message, spawn };
  }

  it('runs the agent in a sibling worktree on its own chat branch, never in the repo itself', async () => {
    const { spawn, deps, chat, events } = await withChanges();
    const branch = `chat/update-a-ts-${chat.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase()}`;
    const path = `/work/app-${branch.replace('/', '-')}`;
    expect(deps.git!.createAgentWorktree).toHaveBeenCalledWith('/work/app', { path, branch });
    expect(spawn.calls[0]!.cwd).toBe(path);
    expect(spawn.calls[0]!.args).toContain('acceptEdits');
    expect(deps.git!.captureChanges).toHaveBeenCalledWith(path, 'tree-at-start');
    const after = ((await deps.store.loadAll()) as Chat[]).find((c) => c.id === chat.id)!;
    expect(after.worktree).toEqual({ path, branch, repoPath: '/work/app' });
    expect(events).toContainEqual({ kind: 'chat', chatId: chat.id });
  });

  it('reuses one worktree for the life of the chat, so the session resumes', async () => {
    const spawn = fakeSpawn(async (_c, io) => (io.out(init('s1')), io.out(textDelta('x')), io.out(done('s1')), io.close(0)));
    const git = fakeGit();
    const { service } = setup({ spawn, git });
    const chat = await created(service, { mode: 'edit', repoId: 'repo:/work/app' });
    await service.send({ chatId: chat.id, text: 'first' });
    await service.idle();
    await service.send({ chatId: chat.id, text: 'second' });
    await service.idle();
    expect(git.createAgentWorktree).toHaveBeenCalledTimes(1);
    expect(spawn.calls[1]!.cwd).toBe(spawn.calls[0]!.cwd);
    expect(spawn.calls[1]!.args).toContain('s1');
  });

  it('puts the branch back in a worktree when only the directory was removed', async () => {
    const spawn = fakeSpawn(async (_c, io) => (io.out(textDelta('x')), io.close(0)));
    const git = fakeGit();
    const { service } = setup({ spawn, git });
    const chat = await created(service, { mode: 'edit', repoId: 'repo:/work/app' });
    await service.send({ chatId: chat.id, text: 'first' });
    await service.idle();
    git.disk.clear();
    await service.send({ chatId: chat.id, text: 'second' });
    await service.idle();
    expect(git.createAgentWorktree).toHaveBeenCalledTimes(1);
    expect(git.reattachAgentWorktree).toHaveBeenCalledTimes(1);
    expect(spawn.calls[1]!.cwd).toBe(spawn.calls[0]!.cwd);
  });

  it('ask mode runs in the repo itself until the chat has a worktree, then there', async () => {
    const spawn = fakeSpawn(async (_c, io) => (io.out(textDelta('x')), io.close(0)));
    const { service, deps } = setup({ spawn });
    const chat = await created(service, { mode: 'ask', repoId: 'repo:/work/app' });
    await service.send({ chatId: chat.id, text: 'explain' });
    await service.idle();
    expect(spawn.calls[0]!.cwd).toBe('/work/app');
    expect(deps.git!.createAgentWorktree).not.toHaveBeenCalled();

    await service.update({ id: chat.id, mode: 'edit' });
    await service.send({ chatId: chat.id, text: 'change it' });
    await service.idle();
    await service.update({ id: chat.id, mode: 'ask' });
    await service.send({ chatId: chat.id, text: 'and now?' });
    await service.idle();
    expect(spawn.calls[2]!.cwd).toBe(spawn.calls[1]!.cwd);
    expect(spawn.calls[2]!.cwd).not.toBe('/work/app');
  });

  it('still reports what a stopped turn changed, since it stays in the worktree', async () => {
    const spawn = fakeSpawn(async (_c, io) => {
      io.out(textDelta('partial'));
      while (!io.killed()) await sleep(2);
      io.close(null);
    });
    const { service } = setup({
      spawn,
      git: fakeGit({ captureChanges: vi.fn(async () => ok(captured)) as never }),
    });
    const chat = await created(service, { mode: 'edit', repoId: 'repo:/work/app' });
    await service.send({ chatId: chat.id, text: 'go' });
    await sleep(10);
    await service.cancel(chat.id);
    await service.idle();
    const reply = lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat);
    expect(reply.status).toBe('cancelled');
    expect(reply.changeSet?.files.map((f) => f.path)).toEqual(captured.map((f) => f.path));
  });

  it('attaches a pending change set to the reply, with previews and counts, and stores the patches', async () => {
    const { message, store } = await withChanges();
    expect(message.status).toBe('done');
    const set = message.changeSet!;
    expect(set.status).toBe('pending');
    expect(set.files.map((f) => [f.path, f.status])).toEqual([
      ['src/a.ts', 'pending'],
      ['img.png', 'pending'],
    ]);
    expect(set.files[0]).toMatchObject({ insertions: 2, deletions: 1 });
    expect(set.files[0]!.hunks).toHaveLength(2);
    expect(set.files[0]!.preview).toEqual(['+b', '-x', '+y']);
    expect(set.files[1]!.preview).toEqual(['Binary file']);
    expect(await store.loadPatches(set.id)).toEqual({ 'src/a.ts': fullPatch, 'img.png': 'BIN' });
  });

  it('summary flags a chat with changes waiting', async () => {
    const { service } = await withChanges();
    expect((await service.list())[0]!.pendingChanges).toBe(true);
  });

  it('accepting a whole file applies its full patch to the real repo and marks it accepted', async () => {
    const { service, chat, message, deps } = await withChanges();
    const res = await service.resolveChanges({
      chatId: chat.id,
      changeSetId: message.changeSet!.id,
      decisions: [{ path: 'src/a.ts', action: 'accept' }],
    });
    expect(res.ok).toBe(true);
    expect(deps.git!.applyFilePatches).toHaveBeenCalledWith('/work/app', [{ path: 'src/a.ts', patch: fullPatch }]);
    const set = (res as { value: { changeSet: { status: string; files: { status: string }[] } } }).value.changeSet;
    expect(set.files.map((f) => f.status)).toEqual(['accepted', 'pending']);
    expect(set.status).toBe('partial');
  });

  it('accepting one hunk applies only that hunk', async () => {
    const { service, chat, message, deps } = await withChanges();
    await service.resolveChanges({
      chatId: chat.id,
      changeSetId: message.changeSet!.id,
      decisions: [{ path: 'src/a.ts', action: 'accept', hunks: [1] }],
    });
    const applied = (deps.git!.applyFilePatches as ReturnType<typeof vi.fn>).mock.calls[0]![1][0].patch as string;
    expect(applied.startsWith(header)).toBe(true);
    expect(applied).toContain('@@ -20,2 +21,3 @@');
    expect(applied).not.toContain('@@ -1,2 +1,3 @@');
    const after = ((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat;
    expect(lastAssistant(after).changeSet!.files[0]!.hunks.map((h) => h.status)).toEqual(['pending', 'accepted']);
  });

  it('rejecting touches nothing on disk', async () => {
    const { service, chat, message, deps } = await withChanges();
    const res = await service.resolveChanges({
      chatId: chat.id,
      changeSetId: message.changeSet!.id,
      decisions: [
        { path: 'src/a.ts', action: 'reject' },
        { path: 'img.png', action: 'reject' },
      ],
    });
    expect(deps.git!.applyFilePatches).not.toHaveBeenCalled();
    expect((res as { value: { changeSet: { status: string } } }).value.changeSet.status).toBe('rejected');
  });

  it('does not apply an already-decided hunk twice', async () => {
    const { service, chat, message, deps } = await withChanges();
    const id = message.changeSet!.id;
    await service.resolveChanges({ chatId: chat.id, changeSetId: id, decisions: [{ path: 'src/a.ts', action: 'accept' }] });
    await service.resolveChanges({ chatId: chat.id, changeSetId: id, decisions: [{ path: 'src/a.ts', action: 'accept' }] });
    expect(deps.git!.applyFilePatches).toHaveBeenCalledTimes(1);
  });

  it('answers a conflict envelope, marks the file conflict, and still applies the rest', async () => {
    const { service, chat, message, deps } = await withChanges();
    (deps.git!.applyFilePatches as ReturnType<typeof vi.fn>).mockImplementationOnce(async (_r: string, patches: readonly { path: string }[]) =>
      patches.map((p) => (p.path === 'src/a.ts' ? { path: p.path, ok: false, reason: 'Your working tree changed since this edit was made, so it no longer applies.' } : { path: p.path, ok: true })),
    );

    const res = await service.resolveChanges({
      chatId: chat.id,
      changeSetId: message.changeSet!.id,
      decisions: [
        { path: 'src/a.ts', action: 'accept' },
        { path: 'img.png', action: 'accept' },
      ],
    });

    expect(res).toEqual({ ok: false, kind: 'conflict', files: ['src/a.ts'], op: 'change-apply' });
    const set = lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat).changeSet!;
    expect(set.status).toBe('conflict');
    expect(set.files[0]).toMatchObject({ status: 'conflict', conflict: expect.stringMatching(/working tree changed/) });
    expect(set.files[1]!.status).toBe('accepted');
  });

  it('persists the decision so it survives a restart', async () => {
    const { service, chat, message, store, deps } = await withChanges();
    await service.resolveChanges({ chatId: chat.id, changeSetId: message.changeSet!.id, decisions: [{ path: 'src/a.ts', action: 'reject' }] });
    const reloaded = createChatService({ ...deps, store });
    const got = (await reloaded.get(chat.id)) as { value: { chat: Chat } };
    expect(lastAssistant(got.value.chat).changeSet!.files[0]!.status).toBe('rejected');
  });

  it('refuses to apply when the repository is no longer open (and its recorded path is gone)', async () => {
    const { chat, message, store, deps } = await withChanges();
    const closed = createChatService({ ...deps, store, resolveRepo: () => null });
    const res = await closed.resolveChanges({
      chatId: chat.id,
      changeSetId: message.changeSet!.id,
      decisions: [{ path: 'src/a.ts', action: 'accept' }],
    });
    expect(res).toMatchObject({ ok: false, kind: 'error', message: expect.stringMatching(/not open/) });
    expect(deps.git!.applyFilePatches).not.toHaveBeenCalled();
  });

  it('serves the parsed per-file diffs from the stored patches', async () => {
    const { service, chat, message } = await withChanges();
    const res = await service.changeDiffs(chat.id, message.changeSet!.id);
    expect(res.ok).toBe(true);
    const files = (res as { value: { files: { path: string; diff: { hunks: unknown[] } }[] } }).value.files;
    expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'img.png']);
    expect(files[0]!.diff.hunks).toHaveLength(2);
  });

  it('a turn that changed nothing has no change set; a prepare failure is an error, not a crash', async () => {
    const spawn = fakeSpawn(async (_c, io) => (io.out(textDelta('nothing to do')), io.close(0)));
    const { service } = setup({ spawn });
    const chat = await created(service, { mode: 'edit', repoId: 'repo:/work/app' });
    await service.send({ chatId: chat.id, text: 'hi' });
    await service.idle();
    expect(lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat).changeSet).toBeUndefined();

    const failing = setup({
      spawn,
      git: fakeGit({
        createAgentWorktree: vi.fn(async () => ({ ok: false as const, kind: 'error' as const, message: 'This repository has no commits yet.' })),
      }),
    });
    const c2 = await created(failing.service, { mode: 'edit', repoId: 'repo:/work/app' });
    await failing.service.send({ chatId: c2.id, text: 'hi' });
    await failing.service.idle();
    expect(lastAssistant(((await failing.service.get(c2.id)) as { value: { chat: Chat } }).value.chat)).toMatchObject({
      status: 'error',
      error: 'This repository has no commits yet.',
    });
  });
});

describe('chat service: thinking and usage', () => {
  it('streams thinking apart from the reply, times the burst, and keeps the usage and finish time', async () => {
    let clock = 1_000;
    const spawn = fakeSpawn(async (_c, io) => {
      io.out(line({ type: 'stream_event', event: { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 990, output_tokens: 1 } } } }));
      io.out(thinkingDelta('Let me '));
      io.out(thinkingDelta('think.'));
      await sleep(5);
      clock += 4_000;
      io.out(textDelta('Answer'));
      io.out(line({ type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 50 } } }));
      io.out(done('s'));
      io.close(0);
    });
    const { service, events } = setup({ spawn, now: () => clock });
    const chat = await created(service);
    await service.send({ chatId: chat.id, text: 'why?' });
    await service.idle();

    const reply = lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat);
    expect(reply).toMatchObject({ text: 'Answer', thinking: 'Let me think.', thinkingMs: 4_000, finishedAt: clock });
    expect(reply.usage).toEqual({ outputTokens: 50, contextTokens: 1_050, contextWindow: 200_000 });

    const thinking = events.filter((e) => e.kind === 'thinking').map((e) => (e as { text: string }).text);
    expect(thinking.join('')).toBe('Let me think.');
    expect(events.filter((e) => e.kind === 'delta').map((e) => (e as { text: string }).text).join('')).toBe('Answer');
    expect(events.some((e) => e.kind === 'usage')).toBe(true);
  });

  it('plumbs Ollama thinking and usage through its stream callbacks', async () => {
    const ollamaStream = vi.fn(
      async (req: { onDelta: (t: string) => void; onThinking?: (t: string) => void; onUsage?: (u: { outputTokens: number }) => void }) => {
        req.onThinking?.('hmm');
        req.onDelta('Hi');
        req.onUsage?.({ outputTokens: 7 });
        return 'Hi';
      },
    );
    const { service } = setup({ ollamaStream: ollamaStream as never });
    const chat = await created(service, { engine: 'ollama', model: 'qwen3:8b' });
    await service.send({ chatId: chat.id, text: 'hi' });
    await service.idle();
    const reply = lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat);
    expect(reply).toMatchObject({ text: 'Hi', thinking: 'hmm', usage: { outputTokens: 7 } });
  });
});

describe('chat service: Ollama', () => {
  it('streams the reply and sends the whole thread each turn', async () => {
    const seen: { role: string; content: string }[][] = [];
    const ollamaStream = vi.fn(async (req: { messages: { role: string; content: string }[]; onDelta: (t: string) => void }) => {
      seen.push(req.messages);
      req.onDelta('Hel');
      req.onDelta('lo');
      return 'Hello';
    });
    const { service } = setup({ ollamaStream: ollamaStream as never });
    const chat = await created(service, { engine: 'ollama', model: 'llama3.2:3b' });
    await service.send({ chatId: chat.id, text: 'hi' });
    await service.idle();
    await service.send({ chatId: chat.id, text: 'again' });
    await service.idle();

    expect(seen[1]!.map((m) => m.content)).toEqual(['hi', 'Hello', 'again']);
    expect(lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat)).toMatchObject({ text: 'Hello', status: 'done' });
  });

  it('asks for a model when none is chosen, and reports an unreachable daemon plainly', async () => {
    const { service } = setup({ ollamaStream: vi.fn(async () => { throw new Error('fetch failed'); }) as never });
    const noModel = await created(service, { engine: 'ollama' });
    await service.send({ chatId: noModel.id, text: 'hi' });
    await service.idle();
    expect(lastAssistant(((await service.get(noModel.id)) as { value: { chat: Chat } }).value.chat).error).toMatch(/Pick an Ollama model/);

    const down = await created(service, { engine: 'ollama', model: 'm' });
    await service.send({ chatId: down.id, text: 'hi' });
    await service.idle();
    expect(lastAssistant(((await service.get(down.id)) as { value: { chat: Chat } }).value.chat).error).toBe('Could not reach Ollama. Is it running?');
  });

  it('Stop aborts the request and keeps what streamed', async () => {
    const ollamaStream = vi.fn(
      (req: { signal: AbortSignal; onDelta: (t: string) => void }) =>
        new Promise<string>((_resolve, reject) => {
          req.onDelta('part');
          req.signal.addEventListener('abort', () => reject(new Error('Ollama request cancelled.')));
        }),
    );
    const { service } = setup({ ollamaStream: ollamaStream as never });
    const chat = await created(service, { engine: 'ollama', model: 'm' });
    await service.send({ chatId: chat.id, text: 'hi' });
    await sleep(10);
    await service.cancel(chat.id);
    await service.idle();
    expect(lastAssistant(((await service.get(chat.id)) as { value: { chat: Chat } }).value.chat)).toMatchObject({ status: 'cancelled', text: 'part' });
  });
});

describe('chat service: bookkeeping', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup({ spawn: fakeSpawn(async (_c, io) => (io.out(textDelta('x')), io.close(0))) });
  });

  it('creates with the repo it was started in, and refuses one that is not open', async () => {
    const chat = await created(ctx.service, { repoId: 'repo:/work/app' });
    expect(chat).toMatchObject({ repoId: 'repo:/work/app', repoName: 'app', repoPath: '/work/app', title: 'New chat' });
    expect(await ctx.service.create({ engine: 'claude', model: null, mode: 'ask', repoId: 'repo:/gone' })).toMatchObject({ ok: false });
  });

  it('lists newest first with a preview, message count and pin state', async () => {
    const a = await created(ctx.service);
    await sleep(2);
    const b = await created(ctx.service);
    await ctx.service.send({ chatId: a.id, text: 'hello there' });
    await ctx.service.idle();
    await ctx.service.update({ id: b.id, pinned: true });
    const list = await ctx.service.list();
    expect(list[0]!.id).toBe(a.id);
    expect(list[0]).toMatchObject({ messageCount: 2, preview: 'x', pinned: false });
    expect(list.find((c) => c.id === b.id)!.pinned).toBe(true);
  });

  it('renaming and pinning do not move a chat in the recent order; changing settings does', async () => {
    const chat = await created(ctx.service);
    const before = chat.updatedAt;
    await sleep(3);
    const renamed = (await ctx.service.update({ id: chat.id, title: 'Renamed', pinned: true })) as { value: { chat: Chat } };
    expect(renamed.value.chat).toMatchObject({ title: 'Renamed', pinned: true, updatedAt: before });
    await sleep(3);
    const moved = (await ctx.service.update({ id: chat.id, mode: 'edit' })) as { value: { chat: Chat } };
    expect(moved.value.chat.updatedAt).toBeGreaterThan(before);
  });

  it('changing the engine clears the model and session; changing the repo records its name and path', async () => {
    const chat = await created(ctx.service, { model: 'opus-5' });
    const next = (await ctx.service.update({ id: chat.id, engine: 'codex', repoId: 'repo:/work/app' })) as { value: { chat: Chat } };
    expect(next.value.chat).toMatchObject({ engine: 'codex', model: null, session: null, repoName: 'app', repoPath: '/work/app' });
    const cleared = (await ctx.service.update({ id: chat.id, repoId: null })) as { value: { chat: Chat } };
    expect(cleared.value.chat).toMatchObject({ repoId: null, repoName: null, repoPath: null });
  });

  it('refuses settings changes mid-answer but allows a rename', async () => {
    const busy = setup({ spawn: fakeSpawn(async () => {}) });
    const chat = await created(busy.service);
    await busy.service.send({ chatId: chat.id, text: 'hi' });
    expect(await busy.service.update({ id: chat.id, mode: 'edit' })).toMatchObject({ ok: false });
    expect((await busy.service.update({ id: chat.id, title: 'ok' })).ok).toBe(true);
    await busy.service.cancel(chat.id);
    await busy.service.idle();
  });

  it('deletes chats: cancels a running turn, removes files, patches and the worktree, and announces it', async () => {
    const busy = setup({ spawn: fakeSpawn(async () => {}) });
    const chat = await created(busy.service);
    await busy.service.send({ chatId: chat.id, text: 'hi' });
    busy.store.patches.set('cs1', { a: 'b' });
    (busy.store.chats.get(chat.id)!.messages[1] as ChatMessage).changeSet = { id: 'cs1', createdAt: 1, status: 'pending', files: [] };
    const live = ((await busy.service.get(chat.id)) as { value: { chat: Chat } }).value.chat;
    live.messages[1]!.changeSet = { id: 'cs1', createdAt: 1, status: 'pending', files: [] };

    expect(await busy.service.remove([chat.id])).toEqual({ ok: true });
    await busy.service.idle();
    expect(await busy.service.list()).toEqual([]);
    expect(busy.store.chats.has(chat.id)).toBe(false);
    expect(busy.store.patches.has('cs1')).toBe(false);
    expect(busy.events).toContainEqual({ kind: 'removed', chatId: chat.id });
    expect(busy.deps.git!.removeAgentWorktree).not.toHaveBeenCalled();

    // A chat with a worktree takes it (and its branch, when that orphans nothing) with it.
    const withTree = await created(busy.service, { mode: 'edit', repoId: 'repo:/work/app' });
    const wt = { path: '/work/app-chat-x', branch: 'chat/x', repoPath: '/work/app' };
    ((await busy.service.get(withTree.id)) as { value: { chat: Chat } }).value.chat.worktree = wt;
    expect(await busy.service.remove([withTree.id])).toEqual({ ok: true });
    expect(busy.deps.git!.removeAgentWorktree).toHaveBeenCalledWith('/work/app', wt);
  });

  it('on load, a message left streaming by a crash is settled as cancelled', async () => {
    const store = createMemoryChatStore();
    store.chats.set('c1', {
      id: 'c1', title: 't', engine: 'claude', model: null, mode: 'ask', repoId: null, repoName: null, repoPath: null,
      pinned: false, createdAt: 1, updatedAt: 1, session: null,
      messages: [
        { id: 'u', role: 'user', text: 'q', createdAt: 1, status: 'done' },
        { id: 'a', role: 'assistant', text: 'half', createdAt: 2, status: 'streaming' },
      ],
    });
    const { service } = setup({ store });
    const got = (await service.get('c1')) as { value: { chat: Chat } };
    expect(got.value.chat.messages[1]).toMatchObject({ status: 'cancelled', text: 'half' });
    expect((await service.list())[0]!.running).toBe(false);
  });

  it('answers a missing chat with an error envelope on every op', async () => {
    const { service } = ctx;
    expect(await service.get('nope')).toMatchObject({ ok: false, kind: 'error' });
    expect(await service.send({ chatId: 'nope', text: 'x' })).toMatchObject({ ok: false });
    expect(await service.update({ id: 'nope', title: 'x' })).toMatchObject({ ok: false });
    expect(await service.changeDiffs('nope', 'x')).toMatchObject({ ok: false });
    expect(await service.resolveChanges({ chatId: 'nope', changeSetId: 'x', decisions: [{ path: 'a', action: 'accept' }] })).toMatchObject({ ok: false });
  });
});
