import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { ChatService } from '@midnite/studio-feature-chats/main';
import type { CreateResult } from '@midnite/studio-feature-terminal/main';
import {
  agentInteractiveArgs,
  buildResumeCommand,
  failure,
  getProviderSyncTier,
  ok,
  type AgentDefinition,
  type Chat,
  type ChatMessage,
  type GitOpResult,
  type ProviderSyncTier,
  type SessionActivity,
  type SessionHandoffMode,
  type TerminalSession,
  type UnifiedSessionViewMode,
} from '@midnite/studio-shared';

/** Active runner currently holding exclusive write access to an engine session. */
export type RunnerOwner = 'chat' | 'terminal' | 'idle';

export type UnifiedSessionSwitchResult = {
  targetView: UnifiedSessionViewMode;
  chatId?: string;
  terminalId?: string;
  syncTier?: ProviderSyncTier;
};

export type UnifiedSessionCoordinatorDeps = {
  chatService: () => Pick<ChatService, 'get' | 'create' | 'update' | 'isRunning'> | null;
  getTerminal: (sessionId: string) => Promise<TerminalSession | null>;
  saveTerminalNow: (session: TerminalSession) => Promise<void>;
  getOrLocateConversationId: (sessionId: string) => Promise<string | null>;
  listAgents: () => Promise<AgentDefinition[]>;
  livePtyFor: (sessionId: string) => { ptyId: string; pid: number; cols: number; rows: number; legacy: boolean } | null;
  activityFor: (ptyId: string) => SessionActivity | null;
  createPty: (options: {
    sessionId: string;
    kind?: string | undefined;
    cwd: string;
    cols: number;
    rows: number;
    agentId?: string | undefined;
    initialInput?: string | undefined;
  }) => Promise<CreateResult>;
  killPty: (ptyId: string) => void;
  scratchRoot: () => string;
  now?: () => number;
  newId?: () => string;
};

export type UnifiedSessionCoordinator = ReturnType<typeof createUnifiedSessionCoordinator>;

export const HANDOFF_MAX_TURNS = 6;
export const HANDOFF_MAX_CHARS = 2_400;
const HANDOFF_PER_TURN_MAX_CHARS = 500;

/**
 * Format a concise one-way context summary from recent Chat turns for
 * `handoff-only` providers (`cursor`, `copilot`, `aider`, etc.) when
 * switching from Chat to Terminal.
 */
export function buildTranscriptHandoffPrompt(
  messages: readonly ChatMessage[],
  options: { maxTurns?: number; maxChars?: number } = {},
): string {
  const maxTurns = options.maxTurns ?? HANDOFF_MAX_TURNS;
  const maxChars = options.maxChars ?? HANDOFF_MAX_CHARS;

  const replayable = messages.filter(
    (m) => (m.role === 'user' || m.status === 'done') && m.text.trim().length > 0,
  );
  if (replayable.length === 0) return '';

  const recent = replayable.slice(-maxTurns);
  const lines: string[] = [];
  let total = 0;

  // Keep newest turns first when capping total length.
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const m = recent[i]!;
    const role = m.role === 'user' ? 'User' : 'Assistant';
    const collapsed = m.text.replace(/\s+/g, ' ').trim();
    const truncated =
      collapsed.length > HANDOFF_PER_TURN_MAX_CHARS
        ? `${collapsed.slice(0, HANDOFF_PER_TURN_MAX_CHARS - 1)}…`
        : collapsed;
    const line = `${role}: ${truncated}`;
    if (total + line.length > maxChars && lines.length > 0) break;
    total += line.length;
    lines.unshift(line);
  }

  return `Continue from this prior chat context:\n${lines.join('\n')}`;
}

function shellQuote(arg: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Coordinates exclusive runner ownership (`chat` vs `terminal` vs `idle`) across
 * linked Chat and Terminal sessions sharing an `engineSessionId` (Phase 146 Theme C).
 */
export function createUnifiedSessionCoordinator(deps: UnifiedSessionCoordinatorDeps) {
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? randomUUID;

  const byEngineSessionId = new Map<string, 'chat' | 'terminal'>();
  const byChatId = new Map<string, 'chat' | 'terminal'>();
  const byTerminalId = new Map<string, 'chat' | 'terminal'>();

  function setOwner(
    ref: { engineSessionId?: string | null; chatId?: string | null; terminalId?: string | null },
    owner: RunnerOwner,
  ): void {
    const update = (map: Map<string, 'chat' | 'terminal'>, key: string | null | undefined) => {
      if (!key) return;
      if (owner === 'idle') map.delete(key);
      else map.set(key, owner);
    };
    update(byEngineSessionId, ref.engineSessionId);
    update(byChatId, ref.chatId);
    update(byTerminalId, ref.terminalId);
  }

  function ownerFor(ref: {
    engineSessionId?: string | null;
    chatId?: string | null;
    terminalId?: string | null;
  }): RunnerOwner {
    if (ref.engineSessionId) {
      const owner = byEngineSessionId.get(ref.engineSessionId);
      if (owner) return owner;
    }
    if (ref.chatId) {
      const owner = byChatId.get(ref.chatId);
      if (owner) return owner;
    }
    if (ref.terminalId) {
      const owner = byTerminalId.get(ref.terminalId);
      if (owner) return owner;
    }
    return 'idle';
  }

  async function resolvePair(sessionId: string): Promise<{
    chat: Chat | null;
    terminal: TerminalSession | null;
  }> {
    const chats = deps.chatService();
    if (chats) {
      const chatRes = await chats.get(sessionId);
      if (chatRes.ok) {
        const chat = chatRes.value.chat;
        const terminal = chat.linkedTerminalId ? await deps.getTerminal(chat.linkedTerminalId) : null;
        return { chat, terminal };
      }
    }

    const terminal = await deps.getTerminal(sessionId);
    if (terminal) {
      let chat: Chat | null = null;
      if (terminal.linkedChatId && chats) {
        const chatRes = await chats.get(terminal.linkedChatId);
        if (chatRes.ok) chat = chatRes.value.chat;
      }
      return { chat, terminal };
    }

    return { chat: null, terminal: null };
  }

  async function parkPtyIfIdle(
    terminal: TerminalSession,
    syncTier: ProviderSyncTier,
  ): Promise<GitOpResult<{ engineSessionId: string | null }>> {
    const live = deps.livePtyFor(terminal.id);
    if (!live) {
      setOwner({ engineSessionId: terminal.agentConversationId ?? null, chatId: terminal.linkedChatId ?? null, terminalId: terminal.id }, 'idle');
      return ok({ engineSessionId: terminal.agentConversationId ?? null });
    }

    const activity = deps.activityFor(live.ptyId);
    if (activity === 'thinking') {
      return failure('The linked terminal is mid-turn. Wait for it to finish or stop it before switching to Chat.');
    }

    let engineSessionId = terminal.agentConversationId ?? null;
    if (!engineSessionId && syncTier === 'bidirectional') {
      engineSessionId = (await deps.getOrLocateConversationId(terminal.id)) ?? null;
    }

    deps.killPty(live.ptyId);
    setOwner({ engineSessionId, chatId: terminal.linkedChatId ?? null, terminalId: terminal.id }, 'idle');
    return ok({ engineSessionId });
  }

  async function buildTerminalInitialInput(
    agentId: string,
    engineSessionId: string | null,
    handoffMode: SessionHandoffMode,
    syncTier: ProviderSyncTier,
    messages: readonly ChatMessage[] = [],
  ): Promise<string | undefined> {
    const roster = await deps.listAgents();
    const agent = roster.find((a) => a.id === agentId);
    if (!agent) return undefined;

    if (handoffMode === 'fresh') {
      return `${[agent.command, ...(agent.args ?? [])].map(shellQuote).join(' ')}\r`;
    }

    if (syncTier === 'handoff-only') {
      const handoffPrompt = buildTranscriptHandoffPrompt(messages);
      if (!handoffPrompt) {
        return `${[agent.command, ...(agent.args ?? [])].map(shellQuote).join(' ')}\r`;
      }
      const interactiveArgs = agentInteractiveArgs(agent.id);
      return `${[agent.command, ...(agent.args ?? []), ...interactiveArgs, handoffPrompt].map(shellQuote).join(' ')}\r`;
    }

    const resumeArgs =
      engineSessionId && (handoffMode === 'auto' || handoffMode === 'resume')
        ? buildResumeCommand(agent, engineSessionId)
        : handoffMode === 'resume'
          ? buildResumeCommand(agent, null)
          : null;

    const args = resumeArgs ?? agent.args ?? [];
    return `${[agent.command, ...args].map(shellQuote).join(' ')}\r`;
  }

  async function switchToTerminal(
    chat: Chat | null,
    terminal: TerminalSession | null,
    agentId: string,
    syncTier: ProviderSyncTier,
    initialEngineSessionId: string | null,
    handoffMode: SessionHandoffMode,
  ): Promise<GitOpResult<UnifiedSessionSwitchResult>> {
    if (syncTier === 'chat-only') {
      return failure('This provider only supports Chat view.');
    }

    const chats = deps.chatService();
    if (chat && chats?.isRunning(chat.id)) {
      return failure('Wait for the current Chat turn to finish before switching to Terminal.');
    }

    const currentOwner = ownerFor({
      engineSessionId: initialEngineSessionId,
      chatId: chat?.id ?? null,
      terminalId: terminal?.id ?? null,
    });
    if (currentOwner === 'chat') {
      return failure('Wait for the current Chat turn to finish before switching to Terminal.');
    }

    let nextTerminal = terminal;
    if (!nextTerminal) {
      if (!chat) return failure('Session not found.');
      const cwd = chat.worktree?.path ?? chat.repoPath ?? join(deps.scratchRoot(), chat.id);
      nextTerminal = {
        id: newId(),
        kind: 'agent',
        agentId,
        title: chat.title,
        cwd,
        repoId: chat.repoId ?? '',
        createdAt: now(),
        linkedChatId: chat.id,
        preferredView: 'terminal',
        ...(initialEngineSessionId ? { agentConversationId: initialEngineSessionId } : {}),
      };
    } else {
      nextTerminal = {
        ...nextTerminal,
        ...(chat ? { linkedChatId: chat.id } : {}),
        preferredView: 'terminal',
        ...(initialEngineSessionId && !nextTerminal.agentConversationId
          ? { agentConversationId: initialEngineSessionId }
          : {}),
      };
    }

    await deps.saveTerminalNow(nextTerminal);

    if (chat && chats) {
      await chats.update({
        id: chat.id,
        linkedTerminalId: nextTerminal.id,
        preferredView: 'terminal',
      });
    }

    if (syncTier === 'bidirectional' || syncTier === 'handoff-only') {
      const live = deps.livePtyFor(nextTerminal.id);
      if (!live) {
        const initialInput = await buildTerminalInitialInput(
          agentId,
          initialEngineSessionId,
          handoffMode,
          syncTier,
          chat?.messages ?? [],
        );
        const ptyRes = await deps.createPty({
          sessionId: nextTerminal.id,
          kind: 'agent',
          cwd: nextTerminal.cwd,
          cols: 80,
          rows: 24,
          agentId,
          ...(initialInput ? { initialInput } : {}),
        });
        if (!ptyRes.ok) {
          return failure(ptyRes.message);
        }
      }
      setOwner(
        {
          engineSessionId: initialEngineSessionId,
          chatId: chat?.id ?? null,
          terminalId: nextTerminal.id,
        },
        'terminal',
      );
    }

    return ok({
      targetView: 'terminal',
      ...(chat ? { chatId: chat.id } : {}),
      terminalId: nextTerminal.id,
      syncTier,
    });
  }

  async function switchToChat(
    chat: Chat | null,
    terminal: TerminalSession | null,
    agentId: string,
    syncTier: ProviderSyncTier,
    initialEngineSessionId: string | null,
  ): Promise<GitOpResult<UnifiedSessionSwitchResult>> {
    let engineSessionId = initialEngineSessionId;
    if (terminal) {
      const parked = await parkPtyIfIdle(terminal, syncTier);
      if (!parked.ok) return parked;
      if (!engineSessionId && parked.value.engineSessionId) {
        engineSessionId = parked.value.engineSessionId;
      }
    }

    const chats = deps.chatService();
    if (!chats) return failure('Chat service is not available.');

    let nextChat = chat;
    if (!nextChat) {
      if (!terminal) return failure('Session not found.');
      const created = await chats.create({
        engine: agentId,
        model: null,
        mode: 'edit',
        repoId: terminal.repoId || null,
      });
      if (!created.ok) return created;
      nextChat = created.value.chat;
      const updated = await chats.update({
        id: nextChat.id,
        title: terminal.title,
        linkedTerminalId: terminal.id,
        preferredView: 'chat',
        ...(engineSessionId && syncTier === 'bidirectional'
          ? { session: { engine: agentId, id: engineSessionId, cwd: terminal.cwd } }
          : {}),
      });
      if (updated.ok) nextChat = updated.value.chat;
    } else {
      const sessionCwd =
        nextChat.worktree?.path ?? nextChat.repoPath ?? terminal?.cwd ?? nextChat.session?.cwd ?? '';
      const updated = await chats.update({
        id: nextChat.id,
        ...(terminal ? { linkedTerminalId: terminal.id } : {}),
        preferredView: 'chat',
        ...(engineSessionId &&
        syncTier === 'bidirectional' &&
        sessionCwd &&
        (!nextChat.session || nextChat.session.id !== engineSessionId)
          ? { session: { engine: agentId, id: engineSessionId, cwd: sessionCwd } }
          : {}),
      });
      if (updated.ok) nextChat = updated.value.chat;
    }

    if (terminal) {
      await deps.saveTerminalNow({
        ...terminal,
        linkedChatId: nextChat.id,
        preferredView: 'chat',
        ...(engineSessionId && !terminal.agentConversationId ? { agentConversationId: engineSessionId } : {}),
      });
    }

    return ok({
      targetView: 'chat',
      chatId: nextChat.id,
      ...(terminal ? { terminalId: terminal.id } : {}),
      syncTier,
    });
  }

  async function switchView(req: {
    sessionId: string;
    targetView: UnifiedSessionViewMode;
    handoffMode?: SessionHandoffMode | undefined;
  }): Promise<GitOpResult<UnifiedSessionSwitchResult>> {
    const { chat, terminal } = await resolvePair(req.sessionId);
    if (!chat && !terminal) return failure('Session not found.');

    const agentId = chat?.engine ?? terminal?.agentId ?? null;
    if (!agentId) {
      return failure('Only agent sessions can switch between Chat and Terminal views.');
    }

    const syncTier = getProviderSyncTier(agentId);
    let engineSessionId = chat?.session?.id ?? terminal?.agentConversationId ?? null;
    if (!engineSessionId && terminal && syncTier === 'bidirectional') {
      engineSessionId = (await deps.getOrLocateConversationId(terminal.id)) ?? null;
    }

    const handoffMode = req.handoffMode ?? 'auto';
    if (req.targetView === 'terminal') {
      return switchToTerminal(chat, terminal, agentId, syncTier, engineSessionId, handoffMode);
    }
    return switchToChat(chat, terminal, agentId, syncTier, engineSessionId);
  }

  async function beforeChatSend(chat: Chat): Promise<GitOpResult> {
    const syncTier = getProviderSyncTier(chat.engine);
    let engineSessionId = chat.session?.id ?? null;
    const terminalId = chat.linkedTerminalId ?? null;

    if (terminalId) {
      const terminal = await deps.getTerminal(terminalId);
      if (terminal) {
        const parked = await parkPtyIfIdle(terminal, syncTier);
        if (!parked.ok) return parked;
        if (!engineSessionId && parked.value.engineSessionId) {
          engineSessionId = parked.value.engineSessionId;
          const chats = deps.chatService();
          const cwd = chat.worktree?.path ?? chat.repoPath ?? terminal.cwd;
          if (chats && syncTier === 'bidirectional' && cwd) {
            await chats.update({
              id: chat.id,
              session: { engine: chat.engine, id: engineSessionId, cwd },
            });
          }
        }
      }
    }

    if (
      engineSessionId &&
      byEngineSessionId.get(engineSessionId) === 'terminal'
    ) {
      return failure('Another terminal runner currently owns this session.');
    }

    setOwner(
      {
        engineSessionId,
        chatId: chat.id,
        terminalId,
      },
      'chat',
    );
    return ok();
  }

  async function onChatTurnEnd(chat: Chat): Promise<void> {
    const engineSessionId = chat.session?.id ?? null;
    const terminalId = chat.linkedTerminalId ?? null;

    if (ownerFor({ engineSessionId, chatId: chat.id, terminalId }) === 'chat') {
      setOwner({ engineSessionId, chatId: chat.id, terminalId }, 'idle');
    }

    if (terminalId && engineSessionId) {
      const terminal = await deps.getTerminal(terminalId);
      if (terminal && terminal.agentConversationId !== engineSessionId) {
        await deps.saveTerminalNow({ ...terminal, agentConversationId: engineSessionId });
      }
    }
  }

  function onPtyExit(terminalId: string): void {
    if (byTerminalId.get(terminalId) === 'terminal') {
      setOwner({ terminalId }, 'idle');
    }
  }

  return {
    ownerFor,
    switchView,
    beforeChatSend,
    onChatTurnEnd,
    onPtyExit,
  };
}
