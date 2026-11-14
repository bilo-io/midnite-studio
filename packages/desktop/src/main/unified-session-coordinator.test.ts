import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createChatService,
  createChatStore,
  createMemoryChatStore,
  type ChatService,
} from '@midnite/studio-feature-chats/main';
import {
  configureTerminals,
  createTerminalStore,
  getTerminal,
  resetTerminalsForTest,
  saveTerminalNow,
  setTerminalPorts,
} from '@midnite/studio-feature-terminal/main';
import {
  BUILTIN_AGENTS,
  CHAT_ENGINE_OLLAMA,
  type AgentDefinition,
  type SessionActivity,
  type TerminalSession,
} from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createUnifiedSessionCoordinator } from './unified-session-coordinator';

function makeAgentRoster(): AgentDefinition[] {
  return BUILTIN_AGENTS.map((a) => ({ ...a }));
}

describe('UnifiedSessionCoordinator', () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    resetTerminalsForTest();
  });

  afterEach(async () => {
    resetTerminalsForTest();
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
    tempDirs = [];
  });

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'midnite-unified-'));
    tempDirs.push(dir);
    return dir;
  }

  function setupTestHarness(options?: {
    initialPty?: { ptyId: string; pid: number; cols: number; rows: number; legacy: boolean } | null;
    activity?: SessionActivity | null;
    locatedConversationId?: string | null;
    chatRunning?: boolean;
  }) {
    const terminals = new Map<string, TerminalSession>();
    let livePty = options?.initialPty ?? null;
    let activity: SessionActivity | null = options?.activity ?? 'idle';
    let locatedConversationId = options?.locatedConversationId ?? null;
    const killedPtys: string[] = [];
    const createdPtys: Array<{
      sessionId: string;
      agentId?: string | undefined;
      cwd: string;
      initialInput?: string | undefined;
    }> = [];
    let idSeq = 0;

    const store = createMemoryChatStore();
    const chatSvc: ChatService = createChatService({
      store,
      agents: async () => makeAgentRoster(),
      resolveRepo: (id) => (id === 'repo-1' ? { id: 'repo-1', path: '/tmp/repo-1', name: 'repo-1' } : null),
      emit: () => undefined,
      sandboxRoot: '/tmp/midnite-test-sandbox',
      scratchRoot: '/tmp/midnite-test-scratch',
      spawn: ((() => {
        throw new Error('spawn should not run in coordinator unit test');
      }) as unknown) as NonNullable<Parameters<typeof createChatService>[0]['spawn']>,
      beforeSend: (chat) => coordinator.beforeChatSend(chat),
      onTurnEnd: (chat) => coordinator.onChatTurnEnd(chat),
      newId: () => `id-${++idSeq}`,
      now: () => 1_700_000_000_000 + idSeq,
    });

    const chatServiceProxy = {
      get: chatSvc.get,
      create: chatSvc.create,
      update: chatSvc.update,
      isRunning: (chatId: string) => options?.chatRunning ?? chatSvc.isRunning(chatId),
    };

    const coordinator = createUnifiedSessionCoordinator({
      chatService: () => chatServiceProxy,
      getTerminal: async (id) => terminals.get(id) ?? null,
      saveTerminalNow: async (s) => {
        terminals.set(s.id, s);
      },
      getOrLocateConversationId: async () => locatedConversationId,
      listAgents: async () => makeAgentRoster(),
      livePtyFor: (sessionId) => (livePty && terminals.has(sessionId) ? livePty : null),
      activityFor: () => activity,
      createPty: async (opts) => {
        createdPtys.push({
          sessionId: opts.sessionId,
          agentId: opts.agentId,
          cwd: opts.cwd,
          initialInput: opts.initialInput,
        });
        livePty = { ptyId: `pty-${opts.sessionId}`, pid: 4242, cols: opts.cols, rows: opts.rows, legacy: false };
        return { ok: true, ptyId: livePty.ptyId, pid: livePty.pid };
      },
      killPty: (ptyId) => {
        killedPtys.push(ptyId);
        if (livePty?.ptyId === ptyId) livePty = null;
      },
      scratchRoot: () => '/tmp/midnite-test-scratch',
      newId: () => `id-${++idSeq}`,
      now: () => 1_700_000_000_000 + idSeq,
    });

    return {
      coordinator,
      chatSvc,
      terminals,
      killedPtys,
      createdPtys,
      setLivePty: (next: typeof livePty) => {
        livePty = next;
      },
      setActivity: (next: SessionActivity | null) => {
        activity = next;
      },
      setLocatedConversationId: (next: string | null) => {
        locatedConversationId = next;
      },
    };
  }

  it.each([
    { agentId: 'claude', convId: 'claude-conv-123', expectedInput: 'claude --resume claude-conv-123\r' },
    { agentId: 'codex', convId: 'codex-thread-456', expectedInput: 'codex resume codex-thread-456\r' },
    { agentId: 'agy', convId: 'agy-conv-789', expectedInput: 'agy --conversation agy-conv-789\r' },
  ])(
    'hands off engineSessionId across Chat <-> Terminal for bidirectional provider $agentId',
    async ({ agentId, convId, expectedInput }) => {
      const h = setupTestHarness();

      const created = await h.chatSvc.create({
        engine: agentId,
        model: null,
        mode: 'edit',
        repoId: 'repo-1',
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const chatId = created.value.chat.id;

      await h.chatSvc.update({
        id: chatId,
        session: { engine: agentId, id: convId, cwd: '/tmp/repo-1' },
      });

      // Switch Chat -> Terminal
      const toTerminal = await h.coordinator.switchView({
        sessionId: chatId,
        targetView: 'terminal',
        handoffMode: 'auto',
      });
      expect(toTerminal.ok).toBe(true);
      if (!toTerminal.ok) return;

      expect(toTerminal.value.targetView).toBe('terminal');
      expect(toTerminal.value.chatId).toBe(chatId);
      expect(toTerminal.value.terminalId).toBeTruthy();
      expect(toTerminal.value.syncTier).toBe('bidirectional');

      const terminalId = toTerminal.value.terminalId!;
      expect(h.createdPtys).toHaveLength(1);
      expect(h.createdPtys[0]?.initialInput).toBe(expectedInput);
      expect(h.coordinator.ownerFor({ engineSessionId: convId, chatId, terminalId })).toBe('terminal');

      // Switch Terminal -> Chat (idle PTY should be parked)
      h.setActivity('idle');
      const toChat = await h.coordinator.switchView({
        sessionId: terminalId,
        targetView: 'chat',
        handoffMode: 'auto',
      });
      expect(toChat.ok).toBe(true);
      if (!toChat.ok) return;

      expect(toChat.value.targetView).toBe('chat');
      expect(toChat.value.chatId).toBe(chatId);
      expect(toChat.value.terminalId).toBe(terminalId);
      expect(h.killedPtys).toEqual([`pty-${terminalId}`]);
      expect(h.coordinator.ownerFor({ engineSessionId: convId, chatId, terminalId })).toBe('idle');
    },
  );

  it('refuses switching to Chat or sending a Chat turn while the linked PTY is mid-turn (thinking)', async () => {
    const h = setupTestHarness({
      initialPty: { ptyId: 'pty-term-1', pid: 99, cols: 80, rows: 24, legacy: false },
      activity: 'thinking',
    });

    h.terminals.set('term-1', {
      id: 'term-1',
      kind: 'agent',
      agentId: 'claude',
      title: 'Claude Terminal',
      cwd: '/tmp/repo-1',
      repoId: 'repo-1',
      createdAt: 1000,
      agentConversationId: 'conv-busy',
    });

    // Switching Terminal -> Chat while thinking fails without killing PTY
    const switchRes = await h.coordinator.switchView({
      sessionId: 'term-1',
      targetView: 'chat',
      handoffMode: 'auto',
    });
    expect(switchRes.ok).toBe(false);
    expect(h.killedPtys).toHaveLength(0);

    // Link a chat to term-1 and try ChatService.send while PTY is thinking
    const chatRes = await h.chatSvc.create({ engine: 'claude', model: null, mode: 'edit', repoId: 'repo-1' });
    expect(chatRes.ok).toBe(true);
    if (!chatRes.ok) return;
    await h.chatSvc.update({
      id: chatRes.value.chat.id,
      linkedTerminalId: 'term-1',
      session: { engine: 'claude', id: 'conv-busy', cwd: '/tmp/repo-1' },
    });

    const sendRes = await h.chatSvc.send({ chatId: chatRes.value.chat.id, text: 'hello' });
    expect(sendRes.ok).toBe(false);
    expect(h.killedPtys).toHaveLength(0);

    const afterChat = await h.chatSvc.get(chatRes.value.chat.id);
    expect(afterChat.ok).toBe(true);
    if (afterChat.ok) {
      expect(afterChat.value.chat.messages).toHaveLength(0);
    }
  });

  it('refuses switching to Terminal while Chat is mid-turn', async () => {
    const h = setupTestHarness({ chatRunning: true });
    const created = await h.chatSvc.create({ engine: 'claude', model: null, mode: 'edit', repoId: 'repo-1' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const res = await h.coordinator.switchView({
      sessionId: created.value.chat.id,
      targetView: 'terminal',
      handoffMode: 'auto',
    });
    expect(res.ok).toBe(false);
    expect(h.createdPtys).toHaveLength(0);
  });

  it('refuses switching chat-only (ollama) sessions to Terminal', async () => {
    const h = setupTestHarness();
    const created = await h.chatSvc.create({
      engine: CHAT_ENGINE_OLLAMA,
      model: 'llama3.2',
      mode: 'ask',
      repoId: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const res = await h.coordinator.switchView({
      sessionId: created.value.chat.id,
      targetView: 'terminal',
      handoffMode: 'auto',
    });
    expect(res.ok).toBe(false);
  });

  it('creates and links a Chat when switching from a standalone agent Terminal, capturing located conversationId', async () => {
    const h = setupTestHarness({
      initialPty: { ptyId: 'pty-term-solo', pid: 101, cols: 80, rows: 24, legacy: false },
      activity: 'waiting',
      locatedConversationId: 'agy-located-999',
    });

    h.terminals.set('term-solo', {
      id: 'term-solo',
      kind: 'agent',
      agentId: 'agy',
      title: 'Agy Session',
      cwd: '/tmp/repo-1',
      repoId: 'repo-1',
      createdAt: 1000,
    });

    const res = await h.coordinator.switchView({
      sessionId: 'term-solo',
      targetView: 'chat',
      handoffMode: 'auto',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(h.killedPtys).toEqual(['pty-term-solo']);
    expect(res.value.chatId).toBeTruthy();
    expect(res.value.terminalId).toBe('term-solo');

    const chat = await h.chatSvc.get(res.value.chatId!);
    expect(chat.ok).toBe(true);
    if (chat.ok) {
      expect(chat.value.chat.linkedTerminalId).toBe('term-solo');
      expect(chat.value.chat.preferredView).toBe('chat');
      expect(chat.value.chat.session).toEqual({
        engine: 'agy',
        id: 'agy-located-999',
        cwd: '/tmp/repo-1',
      });
    }
    expect(h.terminals.get('term-solo')?.linkedChatId).toBe(res.value.chatId);
    expect(h.terminals.get('term-solo')?.preferredView).toBe('chat');
  });

  it('persists preferredView and linkedChatId / linkedTerminalId across restarts', async () => {
    const dir = await makeTempDir();
    setTerminalPorts({
      pty: {
        activityFor: () => 'idle',
        dropScrollback: () => undefined,
        livePtyFor: () => null,
        onSessionExit: () => () => undefined,
        readScrollback: () => new Uint8Array(0),
        scrollbackSessionIds: () => [],
        seedScrollback: () => undefined,
      },
      locateAgentConversation: async () => null,
      log: () => undefined,
    });
    configureTerminals(createTerminalStore(dir), dir);

    const chatStore1 = createChatStore(dir);
    const chatSvc1 = createChatService({
      store: chatStore1,
      agents: async () => makeAgentRoster(),
      resolveRepo: () => ({ id: 'repo-1', path: '/tmp/repo-1', name: 'repo-1' }),
      emit: () => undefined,
      sandboxRoot: join(dir, 'sandboxes'),
      scratchRoot: join(dir, 'scratch'),
    });

    const coordinator = createUnifiedSessionCoordinator({
      chatService: () => chatSvc1,
      getTerminal,
      saveTerminalNow,
      getOrLocateConversationId: async () => null,
      listAgents: async () => makeAgentRoster(),
      livePtyFor: () => null,
      activityFor: () => null,
      createPty: async (opts) => ({ ok: true, ptyId: `pty-${opts.sessionId}`, pid: 123 }),
      killPty: () => undefined,
      scratchRoot: () => join(dir, 'scratch'),
    });

    const created = await chatSvc1.create({ engine: 'claude', model: null, mode: 'edit', repoId: 'repo-1' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const chatId = created.value.chat.id;
    await chatSvc1.update({ id: chatId, session: { engine: 'claude', id: 'persisted-conv', cwd: '/tmp/repo-1' } });

    const switched = await coordinator.switchView({
      sessionId: chatId,
      targetView: 'terminal',
      handoffMode: 'auto',
    });
    expect(switched.ok).toBe(true);
    if (!switched.ok) return;
    const terminalId = switched.value.terminalId!;

    // Simulate app restart: reset in-memory state and reload from disk
    resetTerminalsForTest();
    configureTerminals(createTerminalStore(dir), dir);
    const reloadedTerminal = await getTerminal(terminalId);
    expect(reloadedTerminal).not.toBeNull();
    expect(reloadedTerminal?.linkedChatId).toBe(chatId);
    expect(reloadedTerminal?.preferredView).toBe('terminal');
    expect(reloadedTerminal?.agentConversationId).toBe('persisted-conv');

    const chatSvc2 = createChatService({
      store: createChatStore(dir),
      agents: async () => makeAgentRoster(),
      resolveRepo: () => ({ id: 'repo-1', path: '/tmp/repo-1', name: 'repo-1' }),
      emit: () => undefined,
      sandboxRoot: join(dir, 'sandboxes'),
      scratchRoot: join(dir, 'scratch'),
    });
    const reloadedChat = await chatSvc2.get(chatId);
    expect(reloadedChat.ok).toBe(true);
    if (reloadedChat.ok) {
      expect(reloadedChat.value.chat.linkedTerminalId).toBe(terminalId);
      expect(reloadedChat.value.chat.preferredView).toBe('terminal');
    }
    const summaries = await chatSvc2.list();
    expect(summaries[0]?.linkedTerminalId).toBe(terminalId);
    expect(summaries[0]?.preferredView).toBe('terminal');
  });
});
