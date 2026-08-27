import type { TerminalSession, TerminalSessionKind } from '@midnite/git-shared';
import { create } from 'zustand';

import { bridge } from '../../services/bridge';

/**
 * Every terminal the user has open, and which one is showing.
 *
 * Deliberately *not* persisted to localStorage, unlike `ui-store`: the main
 * process owns durability here (`terminals.json` plus the scrollback logs), and
 * a second copy in the renderer would be a second source of truth that drifts
 * the moment a write fails on one side.
 *
 * The runtime half — pty ids, connection states, replay buffers — is keyed
 * alongside the rows rather than stored on them, because none of it survives a
 * quit and putting it on the row would invite persisting it by accident.
 */
export type ConnectionState = 'idle' | 'starting' | 'open' | 'exited' | 'unavailable';

/**
 * What a live agent session appears to be doing, guessed from its own output.
 *
 * There is no channel that tells the app this directly — an agent CLI is just
 * a process writing bytes — so it is inferred from the same markers a human
 * reads off the screen: the "esc to interrupt" hint means it is generating,
 * and the prompt box reappearing means it is back waiting on you.
 */
export type SessionActivity = 'thinking' | 'waiting';

export type NewSessionRequest = {
  kind: TerminalSessionKind;
  agentId?: string;
  title: string;
  /** An initial session name — e.g. the lifecycle action that opened it. */
  name?: string;
  cwd: string;
  repoId: string;
};

type TerminalState = {
  sessions: TerminalSession[];
  activeId: string | null;
  /** False until `hydrate()` has heard back from main, so the UI can wait. */
  hydrated: boolean;

  /** Live pty per session; absent means the session has no process. */
  ptyIds: Record<string, string>;
  states: Record<string, ConnectionState>;
  /**
   * Bytes to replay into a session's xterm on first mount.
   *
   * Consumed once and dropped — a second replay would double the history, and
   * these are the largest things the store ever holds.
   */
  replay: Record<string, Uint8Array>;
  errors: Record<string, string>;
  /**
   * Text to type into a session's shell once its pty is up — WITHOUT a
   * trailing newline, so it sits at the prompt awaiting the user's Enter.
   * How the Agent settings page pastes an uninstall command (Phase 16):
   * pressing Enter is the confirmation, so the app never runs it itself.
   */
  pendingInput: Record<string, string>;
  /**
   * A guessed session name, per session — from the shell's own OSC title for
   * an agent, or the last command typed into a plain shell.
   *
   * Runtime only, never persisted: it is a live guess about a running process,
   * not something the user chose. `session.name` (persisted) always wins where
   * both exist — see `sessionLabel`.
   */
  autoNames: Record<string, string>;
  /** What a live agent session looks to be doing right now; absent otherwise. */
  activity: Record<string, SessionActivity>;

  hydrate: () => Promise<void>;
  openSession: (request: NewSessionRequest) => TerminalSession;
  queueInput: (sessionId: string, input: string) => void;
  /** Consumed on pty creation — one paste per queue, never on a revive. */
  clearPendingInput: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;
  setActive: (sessionId: string) => void;
  reorder: (sessionIds: string[]) => void;
  /** The user's own name for a session — persisted. `undefined` clears it. */
  renameSession: (sessionId: string, name: string | undefined) => void;
  setAutoName: (sessionId: string, name: string) => void;
  setActivity: (sessionId: string, activity: SessionActivity | undefined) => void;

  bindPty: (sessionId: string, ptyId: string) => void;
  unbindPty: (sessionId: string) => void;
  setState: (sessionId: string, state: ConnectionState, error?: string) => void;
  /**
   * The restored transcript for a session, or null.
   *
   * A read, not a take: each mount builds a fresh xterm, so replaying into it
   * is correct every time. It is cleared by `bindPty` instead — once a live
   * shell owns the screen, the saved transcript is history the pty is already
   * writing over.
   */
  peekReplay: (sessionId: string) => Uint8Array | null;
};

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  sessions: [],
  activeId: null,
  hydrated: false,
  ptyIds: {},
  states: {},
  replay: {},
  errors: {},
  pendingInput: {},
  autoNames: {},
  activity: {},

  /**
   * Load the saved sessions. Spawns nothing.
   *
   * Restored rows arrive `exited`: they are a transcript of what the terminal
   * printed before the last quit, and the shell behind them is long gone. That
   * is the point — reopening the app with a dozen saved terminals costs nothing
   * until the user asks one of them to run again.
   */
  hydrate: async () => {
    if (get().hydrated) return;
    const api = bridge();
    if (!api) {
      set({ hydrated: true });
      return;
    }

    const { sessions } = await api.terminal.list();

    /*
      Merged, never replaced.

      A session can be opened while the restore is still in flight — the sync
      dialog's "resolve with Claude" does exactly that, from a cold terminal —
      and it is LIVE by the time this resolves, usually with a pty already
      attached. Overwriting `sessions` with the saved list dropped it from the
      store while its process kept running: an orphaned shell nothing holds an
      id for, and a panel that then auto-opened a second one because it saw an
      empty list.
    */
    set((state) => {
      const restored = sessions.map((entry) => entry.session);
      const live = state.sessions.filter((open) => !restored.some((s) => s.id === open.id));

      return {
        hydrated: true,
        sessions: [...restored, ...live],
        // A session opened by hand outranks the restored list for focus: the
        // user asked for it seconds ago, and the saved ones have no process.
        activeId: live.length > 0 ? state.activeId : (restored[0]?.id ?? null),
        states: {
          ...Object.fromEntries(restored.map((s) => [s.id, 'exited' as const])),
          ...state.states,
        },
        replay: Object.fromEntries(
          sessions
            .filter((e) => e.scrollback.length > 0)
            .map((e) => [e.session.id, e.scrollback]),
        ),
      };
    });
  },

  openSession: (request) => {
    const session: TerminalSession = {
      id: crypto.randomUUID(),
      kind: request.kind,
      ...(request.agentId === undefined ? {} : { agentId: request.agentId }),
      title: request.title,
      ...(request.name === undefined ? {} : { name: request.name }),
      cwd: request.cwd,
      repoId: request.repoId,
      createdAt: Date.now(),
    };

    set((state) => ({
      sessions: [...state.sessions, session],
      activeId: session.id,
      states: { ...state.states, [session.id]: 'idle' },
    }));
    bridge()?.terminal.save({ session });
    return session;
  },

  closeSession: (sessionId) => {
    const { ptyIds, sessions, activeId } = get();
    const ptyId = ptyIds[sessionId];
    if (ptyId) bridge()?.pty.kill({ ptyId });
    bridge()?.terminal.forget({ sessionId });

    const remaining = sessions.filter((s) => s.id !== sessionId);
    set({
      sessions: remaining,
      // Fall back to the neighbour rather than to nothing: closing the middle of
      // three terminals should leave you in one, not on an empty panel.
      activeId: activeId === sessionId ? nextActiveId(sessions, sessionId) : activeId,
      ...dropKey(get(), sessionId),
    });
    if (remaining.length === 0) set({ activeId: null });
  },

  setActive: (activeId) => set({ activeId }),

  queueInput: (sessionId, input) =>
    set((state) => ({ pendingInput: { ...state.pendingInput, [sessionId]: input } })),

  clearPendingInput: (sessionId) =>
    set((state) => {
      if (!(sessionId in state.pendingInput)) return state;
      const pendingInput = { ...state.pendingInput };
      delete pendingInput[sessionId];
      return { pendingInput };
    }),

  reorder: (sessionIds) => {
    set((state) => {
      const byId = new Map(state.sessions.map((s) => [s.id, s]));
      const ordered = sessionIds.flatMap((id) => {
        const session = byId.get(id);
        return session ? [session] : [];
      });
      return { sessions: ordered };
    });
    bridge()?.terminal.reorder({ sessionIds });
  },

  renameSession: (sessionId, name) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const trimmed = name?.trim();
    const next: TerminalSession = trimmed
      ? { ...session, name: trimmed }
      : // Falls back through to `undefined` explicitly, so a rename to '' clears
        // the override instead of persisting an empty string that would then
        // out-rank the auto-detected name forever.
        { ...session, name: undefined };
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? next : s)),
    }));
    bridge()?.terminal.save({ session: next });
  },

  setAutoName: (sessionId, name) =>
    set((state) => {
      if (state.autoNames[sessionId] === name) return state;
      return { autoNames: { ...state.autoNames, [sessionId]: name } };
    }),

  setActivity: (sessionId, activity) =>
    set((state) => {
      if (state.activity[sessionId] === activity) return state;
      const next = { ...state.activity };
      if (activity === undefined) delete next[sessionId];
      else next[sessionId] = activity;
      return { activity: next };
    }),

  bindPty: (sessionId, ptyId) =>
    set((state) => {
      // The saved transcript retires here: a live shell now owns that screen,
      // and a later remount should replay what the pty wrote, not what the last
      // run did before it.
      const replay = { ...state.replay };
      delete replay[sessionId];
      return { ptyIds: { ...state.ptyIds, [sessionId]: ptyId }, replay };
    }),

  unbindPty: (sessionId) =>
    set((state) => {
      const ptyIds = { ...state.ptyIds };
      delete ptyIds[sessionId];
      return { ptyIds };
    }),

  setState: (sessionId, connection, error) =>
    set((state) => ({
      states: { ...state.states, [sessionId]: connection },
      errors:
        error === undefined
          ? state.errors
          : { ...state.errors, [sessionId]: error },
    })),

  peekReplay: (sessionId) => get().replay[sessionId] ?? null,
}));

/** The row to show after closing one: the next along, else the previous. */
function nextActiveId(sessions: TerminalSession[], closingId: string): string | null {
  const index = sessions.findIndex((s) => s.id === closingId);
  if (index === -1) return null;
  return sessions[index + 1]?.id ?? sessions[index - 1]?.id ?? null;
}

/** Clear every per-session runtime map for one id. */
function dropKey(
  state: TerminalState,
  sessionId: string,
): Pick<
  TerminalState,
  'ptyIds' | 'states' | 'replay' | 'errors' | 'pendingInput' | 'autoNames' | 'activity'
> {
  const ptyIds = { ...state.ptyIds };
  const states = { ...state.states };
  const replay = { ...state.replay };
  const errors = { ...state.errors };
  const pendingInput = { ...state.pendingInput };
  const autoNames = { ...state.autoNames };
  const activity = { ...state.activity };
  delete ptyIds[sessionId];
  delete states[sessionId];
  delete replay[sessionId];
  delete errors[sessionId];
  delete pendingInput[sessionId];
  delete autoNames[sessionId];
  delete activity[sessionId];
  return { ptyIds, states, replay, errors, pendingInput, autoNames, activity };
}

/**
 * A session's own name — the part shown after the repo name in the terminal
 * list, and the value a rename dialog seeds itself with.
 *
 * The user's own choice (`session.name`, persisted) always outranks the live
 * guess (`autoName` — an agent's OSC title, or a shell's last command): once
 * someone names a session, a guess from its output should not overwrite that
 * choice. Absent both, an agent falls back to its roster label ("Claude")
 * rather than the repo name repeated a second time.
 */
export const sessionLabel = (
  session: TerminalSession,
  autoName: string | undefined,
  agentLabel?: string,
): string => session.name ?? autoName ?? agentLabel ?? 'Terminal';
