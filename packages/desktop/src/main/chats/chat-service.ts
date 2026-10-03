import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
  applyFilePatches,
  branchExists,
  buildFilePatch,
  captureChanges,
  createAgentWorktree,
  parseUnifiedDiff,
  reattachAgentWorktree,
  removeAgentWorktree,
  snapshotTree,
  splitFilePatch,
} from '@midnite/studio-git-engine';
import {
  CHAT_ENGINE_OLLAMA,
  changeSetNeedsReview,
  chatTitleFromText,
  chatWorktreeBranch,
  deriveChangeSetStatus,
  deriveFileStatus,
  failure,
  ok,
  reduceChangeSet,
  type AgentDefinition,
  type Chat,
  type ChatAttachment,
  type ChatChangeDecision,
  type ChatChangedFile,
  type ChatChangeSet,
  type ChatEvent,
  type ChatMessage,
  type ChatMode,
  type ChatSummary,
  type ChatUsage,
  type FileDiff,
  type ChatWorktree,
  type GitOpResult,
  siblingWorktreePath,
} from '@midnite/studio-shared';

import { runProcess, type ProcessSink, type SpawnFn } from '../process-runner';
import { buildOllamaMessages, buildTurnPrompt } from './chat-prompt';
import type { ChatStore } from './chat-store';
import { buildInvocation, type ParsedEvent } from './engines';

/**
 * The Chats backend: owns every chat, runs turns, and applies reviewed changes.
 *
 * One service instance per app (see `ipc/chats-handlers.ts`); everything it
 * touches outside memory arrives through {@link ChatServiceDeps}, so a test
 * drives it with a fake CLI, a memory store and a recording emitter.
 *
 * **A turn.** `send` appends the user message and an empty streaming assistant
 * message, answers at once, and runs the turn in the background: it picks the
 * working directory, spawns the roster CLI through `runProcess` (the same spawn
 * engine Docs' Ask AI uses) with its streaming output format, feeds each stdout
 * chunk through the engine's parser, and pushes text to the renderer as it
 * arrives.
 *
 * **The working directory.** An `edit` turn on a repo runs in the chat's own
 * linked worktree (`ChatWorktree`): made on the chat's first editing turn, on a
 * `chat/<slug>-<id>` branch from the repo's HEAD, placed beside the repo the way
 * every app-made worktree is (`siblingWorktreePath`), and reused by every later
 * turn — CLIs key their sessions by directory, so one stable path is what keeps
 * `--resume` working. It is an ordinary worktree: the graph, the worktree list
 * and the user's own `git worktree list` all show it, and its branch is theirs
 * to keep working on. An `ask` turn runs there too once it exists (same
 * session, and the agent sees its own earlier edits), otherwise in the repo;
 * a chat with no repo runs in a scratch directory.
 *
 * **Review.** An `edit` turn snapshots the worktree's state as a tree when it
 * starts and again when it ends (`snapshotTree`, through a throwaway index), and
 * the difference becomes the turn's change set — accept applies it to the
 * user's own checkout, reject leaves it on the chat's branch only. A turn that
 * errors or is stopped still reports what it changed, since those edits stay
 * in the worktree either way.
 *
 * **Deleting a chat** removes its worktree (edits there are discarded — the
 * delete dialog says so) and its branch only when the branch has no commits of
 * its own, so no commit is ever orphaned.
 *
 * **Cancel** kills the process group (`runProcess`'s handle) or aborts the
 * Ollama request, and settles the message as `cancelled` keeping the text so far.
 */

/** A turn that runs longer than this is killed — a hung CLI must not hold a chat forever. */
export const CHAT_TURN_TIMEOUT_MS = 30 * 60_000;
/** How often a streaming chat is flushed to disk. */
const SAVE_DEBOUNCE_MS = 800;
/** Activity chips kept per message. */
const ACTIVITY_CAP = 40;

type Repo = { id: string; path: string; name: string };

export type ChatServiceDeps = {
  store: ChatStore;
  agents: () => Promise<AgentDefinition[]>;
  /** Resolves an open repo by id; `null` when it is no longer open. */
  resolveRepo: (repoId: string) => Promise<Repo | null> | Repo | null;
  emit: (event: ChatEvent) => void;
  /**
   * Where the old per-turn private copies lived (before chats used worktrees).
   * Nothing is written here any more; it is only emptied, so a copy left by an
   * older build does not sit on disk forever.
   */
  sandboxRoot: string;
  /** The working directory of a chat with no repo: `<scratchRoot>/<chatId>`. */
  scratchRoot: string;
  spawn?: SpawnFn | undefined;
  /** Streamed Ollama chat; absent means Ollama is unavailable. */
  ollamaStream?:
    | ((req: {
        model: string;
        messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
        signal: AbortSignal;
        onDelta: (text: string) => void;
        onThinking?: (text: string) => void;
        onUsage?: (usage: ChatUsage) => void;
      }) => Promise<string>)
    | undefined;
  timeoutMs?: number | undefined;
  now?: () => number;
  newId?: () => string;
  /** The git-engine seam — injectable so a test need not make real worktrees. */
  git?: Partial<GitSeam> | undefined;
};

export type GitSeam = {
  createAgentWorktree: typeof createAgentWorktree;
  reattachAgentWorktree: typeof reattachAgentWorktree;
  removeAgentWorktree: typeof removeAgentWorktree;
  branchExists: typeof branchExists;
  snapshotTree: typeof snapshotTree;
  captureChanges: typeof captureChanges;
  applyFilePatches: typeof applyFilePatches;
  /** Whether a worktree directory is still on disk. */
  exists: (path: string) => boolean;
};

type RunHandle = { cancelled: boolean; kill: (() => void) | null; controller: AbortController; assistantId: string };

export type ChatService = ReturnType<typeof createChatService>;

const oneLine = (text: string, max = 90): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** A few `+`/`-` lines for the inline card — enough to recognise the change. */
function previewLines(file: { hunks: { text: string }[]; binary: boolean }): string[] {
  if (file.binary) return ['Binary file'];
  const lines: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.text.split('\n').slice(1)) {
      if ((line.startsWith('+') || line.startsWith('-')) && line.trim().length > 1) lines.push(line.slice(0, 160));
      if (lines.length >= 6) return lines;
    }
  }
  return lines;
}

export function createChatService(deps: ChatServiceDeps) {
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? randomUUID;
  const git: GitSeam = {
    createAgentWorktree,
    reattachAgentWorktree,
    removeAgentWorktree,
    branchExists,
    snapshotTree,
    captureChanges,
    applyFilePatches,
    exists: existsSync,
    ...deps.git,
  };

  const chats = new Map<string, Chat>();
  const running = new Map<string, RunHandle>();
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let loaded = false;

  // --- state helpers ---------------------------------------------------------------

  const needsReview = (chat: Chat): boolean =>
    chat.messages.some((m) => m.changeSet !== undefined && changeSetNeedsReview(m.changeSet));

  const summaryOf = (chat: Chat): ChatSummary => {
    const last = [...chat.messages].reverse().find((m) => m.text.trim().length > 0);
    return {
      id: chat.id,
      title: chat.title,
      engine: chat.engine,
      model: chat.model,
      mode: chat.mode,
      repoId: chat.repoId,
      repoName: chat.repoName,
      pinned: chat.pinned,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat.messages.length,
      preview: last ? oneLine(last.text) : '',
      running: running.has(chat.id),
      pendingChanges: needsReview(chat),
      worktree: chat.worktree ?? null,
    };
  };

  const persist = async (chat: Chat): Promise<void> => {
    const timer = saveTimers.get(chat.id);
    if (timer) {
      clearTimeout(timer);
      saveTimers.delete(chat.id);
    }
    await deps.store.save(chat);
  };

  const persistSoon = (chat: Chat): void => {
    if (saveTimers.has(chat.id)) return;
    const timer = setTimeout(() => {
      saveTimers.delete(chat.id);
      void deps.store.save(chat);
    }, SAVE_DEBOUNCE_MS);
    timer.unref?.();
    saveTimers.set(chat.id, timer);
  };

  const emitChat = (chatId: string): void => deps.emit({ kind: 'chat', chatId });

  const ensureLoaded = async (): Promise<void> => {
    if (loaded) return;
    loaded = true;
    for (const chat of await deps.store.loadAll()) {
      // A turn that was streaming when the app died can never finish.
      for (const message of chat.messages) {
        if (message.status === 'streaming') {
          message.status = 'cancelled';
          message.error = message.error ?? 'The app closed before this answer finished.';
        }
      }
      chats.set(chat.id, chat);
    }
    // Legacy: older builds ran edit turns in private copies here.
    await rm(deps.sandboxRoot, { recursive: true, force: true }).catch(() => undefined);
  };

  const repoFor = async (chat: Chat): Promise<{ path: string; name: string } | null> => {
    if (chat.repoId) {
      const repo = await deps.resolveRepo(chat.repoId);
      if (repo) return { path: repo.path, name: repo.name };
    }
    // The repo was closed since: fall back to the path recorded at creation, if it is still there.
    if (chat.repoPath && existsSync(chat.repoPath)) return { path: chat.repoPath, name: chat.repoName ?? basename(chat.repoPath) };
    return null;
  };

  // --- CRUD -------------------------------------------------------------------------

  async function list(): Promise<ChatSummary[]> {
    await ensureLoaded();
    return [...chats.values()].map(summaryOf).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function get(id: string): Promise<GitOpResult<{ chat: Chat }>> {
    await ensureLoaded();
    const chat = chats.get(id);
    return chat ? ok({ chat }) : failure('That chat no longer exists.');
  }

  async function create(req: { engine: string; model: string | null; mode: ChatMode; repoId: string | null }): Promise<GitOpResult<{ chat: Chat }>> {
    await ensureLoaded();
    let repo: Repo | null = null;
    if (req.repoId) {
      repo = (await deps.resolveRepo(req.repoId)) ?? null;
      if (!repo) return failure('That repository is not open.');
    }
    const at = now();
    const chat: Chat = {
      id: newId(),
      title: 'New chat',
      engine: req.engine,
      model: req.model,
      mode: req.mode,
      repoId: repo?.id ?? null,
      repoName: repo?.name ?? null,
      repoPath: repo?.path ?? null,
      pinned: false,
      createdAt: at,
      updatedAt: at,
      messages: [],
      session: null,
    };
    chats.set(chat.id, chat);
    await persist(chat);
    emitChat(chat.id);
    return ok({ chat });
  }

  async function update(req: {
    id: string;
    title?: string | undefined;
    pinned?: boolean | undefined;
    engine?: string | undefined;
    model?: string | null | undefined;
    mode?: ChatMode | undefined;
    repoId?: string | null | undefined;
  }): Promise<GitOpResult<{ chat: Chat }>> {
    await ensureLoaded();
    const chat = chats.get(req.id);
    if (!chat) return failure('That chat no longer exists.');
    const settings = req.engine !== undefined || req.model !== undefined || req.mode !== undefined || req.repoId !== undefined;
    if (settings && running.has(chat.id)) return failure('Wait for the answer to finish (or stop it) before changing the chat settings.');

    if (req.title !== undefined) chat.title = req.title;
    if (req.pinned !== undefined) chat.pinned = req.pinned;
    if (req.engine !== undefined && req.engine !== chat.engine) {
      chat.engine = req.engine;
      // A model id means nothing to a different engine, and its session cannot resume.
      chat.model = req.model === undefined ? null : req.model;
      chat.session = null;
    } else if (req.model !== undefined) {
      chat.model = req.model;
    }
    if (req.mode !== undefined) chat.mode = req.mode;
    if (req.repoId !== undefined && req.repoId !== chat.repoId) {
      if (req.repoId === null) {
        chat.repoId = null;
        chat.repoName = null;
        chat.repoPath = null;
      } else {
        const repo = await deps.resolveRepo(req.repoId);
        if (!repo) return failure('That repository is not open.');
        chat.repoId = repo.id;
        chat.repoName = repo.name;
        chat.repoPath = repo.path;
      }
      // The worktree belongs to the old repo. It stays on disk as an ordinary
      // branch the user can keep or remove from the graph; the chat moves on.
      chat.worktree = null;
    }
    // Pinning and renaming are bookkeeping; they must not float a chat to the top of "recent".
    if (settings) chat.updatedAt = now();
    await persist(chat);
    emitChat(chat.id);
    return ok({ chat });
  }

  const changeSetIds = (chat: Chat): string[] =>
    chat.messages.flatMap((m) => (m.changeSet ? [m.changeSet.id] : []));

  async function remove(ids: readonly string[]): Promise<GitOpResult> {
    await ensureLoaded();
    for (const id of ids) {
      const chat = chats.get(id);
      if (!chat) continue;
      const handle = running.get(id);
      if (handle) cancelHandle(handle);
      chats.delete(id);
      await deps.store.removePatches(changeSetIds(chat));
      await deps.store.remove(id);
      if (chat.worktree) await git.removeAgentWorktree(chat.worktree.repoPath, chat.worktree).catch(() => undefined);
      await rm(join(deps.scratchRoot, id), { recursive: true, force: true }).catch(() => undefined);
      deps.emit({ kind: 'removed', chatId: id });
    }
    return ok();
  }

  // --- turns ------------------------------------------------------------------------

  function cancelHandle(handle: RunHandle): void {
    handle.cancelled = true;
    handle.controller.abort();
    handle.kill?.();
  }

  async function cancel(chatId: string): Promise<GitOpResult> {
    const handle = running.get(chatId);
    if (!handle) return ok();
    cancelHandle(handle);
    return ok();
  }

  async function send(req: {
    chatId: string;
    text?: string | undefined;
    attachments?: ChatAttachment[] | undefined;
    fromMessageId?: string | undefined;
  }): Promise<GitOpResult<{ messageId: string }>> {
    await ensureLoaded();
    const chat = chats.get(req.chatId);
    if (!chat) return failure('That chat no longer exists.');
    if (running.has(chat.id)) return failure('This chat is already answering. Stop it first.');

    let text = req.text;
    let attachments = req.attachments;
    if (req.fromMessageId !== undefined) {
      const index = chat.messages.findIndex((m) => m.id === req.fromMessageId);
      const original = chat.messages[index];
      if (!original || original.role !== 'user') return failure('That message cannot be re-sent.');
      text = text ?? original.text;
      attachments = attachments ?? original.attachments;
      const dropped = chat.messages.splice(index);
      // The engine's own conversation still contains the dropped turns.
      chat.session = null;
      await deps.store.removePatches(dropped.flatMap((m) => (m.changeSet ? [m.changeSet.id] : [])));
    }
    const body = (text ?? '').trim();
    if (body.length === 0 && (attachments?.length ?? 0) === 0) return failure('Write a message first.');

    const at = now();
    const user: ChatMessage = {
      id: newId(),
      role: 'user',
      text: body,
      createdAt: at,
      status: 'done',
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    };
    const assistant: ChatMessage = {
      id: newId(),
      role: 'assistant',
      text: '',
      createdAt: at + 1,
      status: 'streaming',
      engine: chat.engine,
      model: chat.model,
    };
    const history = [...chat.messages];
    if (chat.title === 'New chat') chat.title = chatTitleFromText(body || attachments?.[0]?.name || '');
    chat.messages.push(user, assistant);
    chat.updatedAt = at;
    await persist(chat);
    deps.emit({ kind: 'message', chatId: chat.id, message: user });
    deps.emit({ kind: 'message', chatId: chat.id, message: assistant });
    emitChat(chat.id);

    const handle: RunHandle = { cancelled: false, kill: null, controller: new AbortController(), assistantId: assistant.id };
    running.set(chat.id, handle);
    void runTurn(chat, history, user, assistant, handle).finally(() => {
      running.delete(chat.id);
      emitChat(chat.id);
    });
    return ok({ messageId: assistant.id });
  }

  /** Append streamed text to the assistant message and tell the renderer. */
  const pushDelta = (chat: Chat, message: ChatMessage, text: string): void => {
    if (text.length === 0) return;
    closeThinking(message);
    message.text += text;
    deps.emit({ kind: 'delta', chatId: chat.id, messageId: message.id, text });
    persistSoon(chat);
  };

  /**
   * Thinking bursts, timed: a burst opens on its first chunk and closes on the
   * next thing that is not thinking (text, a tool call, the end of the turn), so
   * `thinkingMs` is time spent reasoning rather than the whole turn.
   */
  const thinkingSince = new Map<string, number>();

  const closeThinking = (message: ChatMessage): void => {
    const since = thinkingSince.get(message.id);
    if (since === undefined) return;
    thinkingSince.delete(message.id);
    message.thinkingMs = (message.thinkingMs ?? 0) + Math.max(0, now() - since);
  };

  const pushThinking = (chat: Chat, message: ChatMessage, text: string): void => {
    if (text.length === 0) return;
    if (!thinkingSince.has(message.id)) thinkingSince.set(message.id, now());
    message.thinking = (message.thinking ?? '') + text;
    deps.emit({ kind: 'thinking', chatId: chat.id, messageId: message.id, text });
    persistSoon(chat);
  };

  const pushUsage = (chat: Chat, message: ChatMessage, usage: ChatUsage): void => {
    message.usage = usage;
    deps.emit({ kind: 'usage', chatId: chat.id, messageId: message.id, usage });
  };

  const pushActivity = (chat: Chat, message: ChatMessage, line: string): void => {
    const lines = message.activity ?? [];
    closeThinking(message);
    if (lines.length >= ACTIVITY_CAP || lines[lines.length - 1] === line) return;
    message.activity = [...lines, line];
    deps.emit({ kind: 'activity', chatId: chat.id, messageId: message.id, line });
  };

  type TurnResult = { error?: string; sessionId?: string; finalText?: string; timedOut?: boolean };

  /**
   * The chat's worktree, made or restored as needed: reused while it is on
   * disk, put back on its branch if only the directory went, made fresh
   * otherwise. Persisted on the chat the moment it changes.
   */
  async function ensureWorktree(chat: Chat, repo: { path: string; name: string }): Promise<GitOpResult<ChatWorktree>> {
    const known = chat.worktree && chat.worktree.repoPath === repo.path ? chat.worktree : null;
    if (known && git.exists(known.path)) return ok(known);

    let made: ChatWorktree | null = null;
    if (known && (await git.branchExists(repo.path, known.branch))) {
      const back = await git.reattachAgentWorktree(repo.path, known);
      if (!back.ok) return back;
      made = known;
    } else {
      const branch = chatWorktreeBranch(chat.title, chat.id);
      const path = siblingWorktreePath(repo.path, repo.name, branch);
      const created = await git.createAgentWorktree(repo.path, { path, branch });
      if (!created.ok) return created;
      made = { path, branch, repoPath: repo.path };
    }
    chat.worktree = made;
    await persist(chat);
    emitChat(chat.id);
    return ok(made);
  }

  async function runTurn(chat: Chat, history: ChatMessage[], user: ChatMessage, assistant: ChatMessage, handle: RunHandle): Promise<void> {
    let changeSet: ChatChangeSet | undefined;
    let error: string | undefined;
    let sessionId: string | undefined;
    let sessionCwd: string | undefined;
    let finalText: string | undefined;
    try {
      if (chat.engine === CHAT_ENGINE_OLLAMA) {
        const out = await runOllama(chat, history, user, assistant, handle);
        error = out.error;
      } else {
        const repo = await repoFor(chat);
        let cwd: string;
        let baseTree: string | null = null;
        if (repo && chat.mode === 'edit') {
          const worktree = await ensureWorktree(chat, repo);
          if (!worktree.ok) {
            error = worktree.kind === 'error' ? worktree.message : 'Could not prepare a worktree for this chat.';
            return;
          }
          cwd = worktree.value.path;
          const base = await git.snapshotTree(cwd);
          if (!base.ok) {
            error = base.kind === 'error' ? base.message : 'Could not read the chat worktree.';
            return;
          }
          baseTree = base.value;
        } else if (repo) {
          const own = chat.worktree && chat.worktree.repoPath === repo.path && git.exists(chat.worktree.path) ? chat.worktree.path : null;
          cwd = own ?? repo.path;
        } else {
          cwd = join(deps.scratchRoot, chat.id);
          await mkdir(cwd, { recursive: true });
        }
        if (handle.cancelled) return;

        const out = await runAgent(chat, history, user, assistant, handle, cwd);
        error = out.error;
        sessionId = out.sessionId;
        sessionCwd = cwd;
        finalText = out.finalText;

        // Captured even after an error or a Stop: whatever the agent did is in
        // the worktree either way, and the next turn's baseline would hide it.
        if (baseTree !== null && chats.get(chat.id) === chat) {
          const captured = await git.captureChanges(cwd, baseTree);
          if (!captured.ok) {
            error = error ?? (captured.kind === 'error' ? captured.message : 'Could not read the changes.');
          } else if (captured.value.length > 0) {
            changeSet = buildChangeSet(newId(), now(), captured.value);
            await deps.store.savePatches(
              changeSet.id,
              Object.fromEntries(captured.value.map((f) => [f.path, f.patch])),
            );
          }
        }
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      closeThinking(assistant);
      assistant.finishedAt = now();
      if (changeSet) assistant.changeSet = changeSet;
      if (handle.cancelled) {
        assistant.status = 'cancelled';
      } else if (error) {
        assistant.status = 'error';
        assistant.error = error;
      } else {
        assistant.status = 'done';
        if (assistant.text.trim().length === 0 && finalText) assistant.text = finalText;
        if (assistant.text.trim().length === 0 && !changeSet) {
          assistant.status = 'error';
          assistant.error = 'The agent answered with nothing.';
        }
        if (sessionId && sessionCwd) chat.session = { engine: chat.engine, id: sessionId, cwd: sessionCwd };
      }
      // A chat deleted mid-turn (Delete cancels it) must stay deleted: persisting here
      // would write the file straight back.
      if (chats.get(chat.id) === chat) {
        chat.updatedAt = now();
        await persist(chat);
        deps.emit({ kind: 'message', chatId: chat.id, message: assistant });
      }
    }
  }

  async function runOllama(chat: Chat, history: ChatMessage[], user: ChatMessage, assistant: ChatMessage, handle: RunHandle): Promise<TurnResult> {
    if (!deps.ollamaStream) return { error: 'Ollama is not available.' };
    if (!chat.model) return { error: 'Pick an Ollama model for this chat first.' };
    try {
      await deps.ollamaStream({
        model: chat.model,
        messages: buildOllamaMessages(history, user),
        signal: handle.controller.signal,
        onDelta: (text) => pushDelta(chat, assistant, text),
        onThinking: (text) => pushThinking(chat, assistant, text),
        onUsage: (usage) => pushUsage(chat, assistant, usage),
      });
      return {};
    } catch (caught) {
      if (handle.cancelled) return {};
      const message = caught instanceof Error ? caught.message : String(caught);
      return { error: /fetch failed|ECONNREFUSED/i.test(message) ? 'Could not reach Ollama. Is it running?' : message };
    }
  }

  async function runAgent(
    chat: Chat,
    history: ChatMessage[],
    user: ChatMessage,
    assistant: ChatMessage,
    handle: RunHandle,
    cwd: string,
  ): Promise<TurnResult> {
    const roster = await deps.agents();
    const agent = roster.find((a) => a.id === chat.engine);
    if (!agent) return { error: `${chat.engine} is not on the agent roster.` };

    const resumable = chat.session && chat.session.engine === chat.engine && chat.session.cwd === cwd ? chat.session.id : null;
    // Resume first; if that attempt dies before saying anything, try once more with a replay.
    const attempts: (string | null)[] = resumable ? [resumable, null] : [null];

    let last: TurnResult = {};
    for (const sessionId of attempts) {
      const prompt = buildTurnPrompt({ history, message: user, resumed: sessionId !== null });
      const invocation = buildInvocation({ agent, prompt, mode: chat.mode, model: chat.model, sessionId });
      if (!invocation) return { error: `${agent.label} has no headless mode, so it cannot back a chat.` };

      const textBefore = assistant.text.length;
      let result: TurnResult = {};
      const sink: ProcessSink<null> = {
        push: (chunk) => {
          // Runs of reply text, and runs of thinking, go out as one event each per chunk.
          let pending = '';
          let pendingKind: 'delta' | 'thinking' = 'delta';
          const flush = () => {
            if (!pending) return;
            if (pendingKind === 'delta') pushDelta(chat, assistant, pending);
            else pushThinking(chat, assistant, pending);
            pending = '';
          };
          for (const event of invocation.parser.push(chunk)) {
            if (event.type === 'delta' || event.type === 'thinking') {
              if (pendingKind !== event.type) flush();
              pendingKind = event.type;
              pending += event.text;
            } else {
              flush();
              result = absorb(chat, assistant, event, result);
            }
          }
          flush();
        },
        finish: () => {
          for (const event of invocation.parser.finish()) {
            if (event.type === 'delta') pushDelta(chat, assistant, event.text);
            else result = absorb(chat, assistant, event, result);
          }
          return { ok: true, data: null };
        },
      };

      const outcome = await runProcess<null>(agent.command, invocation.args, cwd, {
        sink,
        timeoutMs: deps.timeoutMs ?? CHAT_TURN_TIMEOUT_MS,
        ...(deps.spawn ? { spawn: deps.spawn } : {}),
        onSpawned: (spawned) => {
          handle.kill = spawned.kill;
          // A Stop that landed between "worktree ready" and "process started".
          if (handle.cancelled) spawned.kill();
        },
      });

      if (handle.cancelled) return {};
      if (!outcome.ok) {
        result = {
          ...result,
          error:
            outcome.reason === 'timed-out'
              ? 'That took too long, so it was stopped.'
              : outcome.reason === 'not-installed'
                ? `Could not run ${agent.label}. ${outcome.hint}`
                : outcome.hint,
        };
      } else if (outcome.exitCode !== 0 && result.error === undefined) {
        const said = outcome.stderr.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
        result = { ...result, error: `${agent.label} exited with an error${said ? `: ${oneLine(said, 160)}` : '.'}` };
      }

      last = result;
      const saidNothing = assistant.text.length === textBefore && (result.finalText ?? '').length === 0;
      if (result.error !== undefined && sessionId !== null && saidNothing) {
        // The session is gone (cleaned up, other machine, CLI upgrade) — clear the failure and replay.
        continue;
      }
      return result;
    }
    return last;
  }

  /** Fold one non-delta parser event into the turn's result. */
  function absorb(chat: Chat, assistant: ChatMessage, event: ParsedEvent, result: TurnResult): TurnResult {
    switch (event.type) {
      case 'activity':
        pushActivity(chat, assistant, event.line);
        return result;
      case 'session':
        return { ...result, sessionId: event.id };
      case 'thinking':
        pushThinking(chat, assistant, event.text);
        return result;
      case 'usage':
        pushUsage(chat, assistant, event.usage);
        return result;
      case 'result':
        return {
          ...result,
          ...(event.error !== undefined ? { error: event.error } : {}),
          ...(event.text !== undefined ? { finalText: event.text } : {}),
        };
      default:
        return result;
    }
  }

  // --- change sets ------------------------------------------------------------------

  function buildChangeSet(
    id: string,
    createdAt: number,
    captured: readonly {
      path: string;
      oldPath: string | null;
      change: ChatChangedFile['change'];
      binary: boolean;
      insertions: number;
      deletions: number;
      hunks: { header: string; insertions: number; deletions: number; text: string }[];
    }[],
  ): ChatChangeSet {
    const files: ChatChangedFile[] = captured.map((f) => {
      const base = {
        path: f.path,
        oldPath: f.oldPath,
        change: f.change,
        binary: f.binary,
        insertions: f.insertions,
        deletions: f.deletions,
        preview: previewLines(f),
        hunks: f.hunks.map((h) => ({ header: h.header, insertions: h.insertions, deletions: h.deletions, status: 'pending' as const })),
        fileStatus: 'pending' as const,
      };
      return { ...base, status: deriveFileStatus(base) };
    });
    return { id, createdAt, files, status: deriveChangeSetStatus(files) };
  }

  const findChangeSet = (chat: Chat, changeSetId: string): { message: ChatMessage; changeSet: ChatChangeSet } | null => {
    for (const message of chat.messages) {
      if (message.changeSet?.id === changeSetId) return { message, changeSet: message.changeSet };
    }
    return null;
  };

  async function changeDiffs(chatId: string, changeSetId: string): Promise<GitOpResult<{ files: { path: string; diff: FileDiff }[] }>> {
    await ensureLoaded();
    const chat = chats.get(chatId);
    if (!chat) return failure('That chat no longer exists.');
    const found = findChangeSet(chat, changeSetId);
    if (!found) return failure('Those changes are no longer in the chat.');
    const patches = await deps.store.loadPatches(changeSetId);
    if (!patches) return failure('The stored changes could not be read.');
    const files = found.changeSet.files.flatMap((file) => {
      const patch = patches[file.path];
      if (patch === undefined) return [];
      return [{ path: file.path, diff: parseUnifiedDiff(patch, { contextLines: 3, fallbackPath: file.path, maxLines: 50_000 }) }];
    });
    return ok({ files });
  }

  async function resolveChanges(req: {
    chatId: string;
    changeSetId: string;
    decisions: ChatChangeDecision[];
  }): Promise<GitOpResult<{ changeSet: ChatChangeSet }>> {
    await ensureLoaded();
    const chat = chats.get(req.chatId);
    if (!chat) return failure('That chat no longer exists.');
    const found = findChangeSet(chat, req.changeSetId);
    if (!found) return failure('Those changes are no longer in the chat.');
    const repo = await repoFor(chat);
    if (!repo) return failure('The repository for this chat is not open, so the changes cannot be applied.');
    const patches = await deps.store.loadPatches(req.changeSetId);
    if (!patches) return failure('The stored changes could not be read.');

    // One decision per path: the first wins, so a double-click cannot apply twice.
    const seen = new Set<string>();
    const decisions = req.decisions.filter((d) => (seen.has(d.path) ? false : (seen.add(d.path), true)));

    const toApply: { path: string; patch: string }[] = [];
    const settled: { path: string; ok: true }[] = [];
    for (const decision of decisions) {
      const file = found.changeSet.files.find((f) => f.path === decision.path);
      if (!file) continue;
      if (decision.action === 'reject') {
        settled.push({ path: file.path, ok: true });
        continue;
      }
      const stored = patches[file.path];
      if (stored === undefined) {
        settled.push({ path: file.path, ok: true });
        continue;
      }
      const { header, hunks } = splitFilePatch(stored);
      if (file.hunks.length === 0) {
        // Binary / mode-only: all or nothing, and only if nobody decided it yet.
        if (file.fileStatus === 'pending') toApply.push({ path: file.path, patch: stored });
        else settled.push({ path: file.path, ok: true });
        continue;
      }
      const named = decision.hunks === undefined ? null : new Set(decision.hunks);
      const chosen = file.hunks.flatMap((h, i) => (h.status === 'pending' && (named === null || named.has(i)) && hunks[i] !== undefined ? [i] : []));
      if (chosen.length === 0) settled.push({ path: file.path, ok: true });
      else toApply.push({ path: file.path, patch: buildFilePatch(header, chosen.map((i) => hunks[i]!)) });
    }

    const applied = toApply.length > 0 ? await git.applyFilePatches(repo.path, toApply) : [];
    const next = reduceChangeSet(found.changeSet, decisions, [...settled, ...applied]);
    found.message.changeSet = next;
    chat.updatedAt = now();
    await persist(chat);
    deps.emit({ kind: 'message', chatId: chat.id, message: found.message });
    emitChat(chat.id);

    const failed = applied.filter((o) => !o.ok).map((o) => o.path);
    if (failed.length > 0) return { ok: false, kind: 'conflict', files: failed, op: 'change-apply' };
    return ok({ changeSet: next });
  }

  /** Stop everything — app quit. */
  async function shutdown(): Promise<void> {
    for (const handle of running.values()) cancelHandle(handle);
    for (const [id, timer] of saveTimers) {
      clearTimeout(timer);
      saveTimers.delete(id);
      const chat = chats.get(id);
      if (chat) await deps.store.save(chat);
    }
    await rm(deps.sandboxRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  /** Test seam: resolves once no turn is running. */
  async function idle(): Promise<void> {
    while (running.size > 0) await new Promise((resolve) => setTimeout(resolve, 5));
  }

  return { list, get, create, update, remove, send, cancel, changeDiffs, resolveChanges, shutdown, idle };
}
