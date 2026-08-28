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
  /**
   * How many sessions the last `hydrate()` bound to a live pty — a reload or
   * relaunch that found processes still running, rather than a cold restore.
   *
   * Renderer-only, never persisted. Read by the status-bar "Reattached N
   * sessions" note (Phase 30 Theme C); until that theme lands nothing renders
   * it, but `hydrate()` sets it on every launch regardless.
   */
  reattachedCount: number;
  /** `Date.now()` at the `hydrate()` that produced `reattachedCount`. */
  reattachedAt: number;

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
  /**
   * Where a session's shell actually is, from the OSC 7 sequence it emits on
   * `cd` — as opposed to `session.cwd`, which is where it was opened.
   *
   * Runtime only, and deliberately never persisted: a path the shell wandered
   * into is not a path the user chose to open a session at, and writing it to
   * `terminals.json` would silently re-home the session on the next launch.
   * Absent for any shell that does not emit the sequence, which is macOS `zsh`
   * out of the box — everything reading this has to fall back to `session.cwd`.
   */
  liveCwd: Record<string, string>;
  /**
   * Which agent is *actually running* in a session, from main's process probe.
   *
   * A deliberate tri-state, and the distinction is the whole point:
   *
   * - **key absent** — never probed. Fall back to the session's stored
   *   `agentId`, which is what it was opened for.
   * - **`null`** — probed, and nothing recognised is running. An agent that has
   *   quit, so the row gets the plain terminal glyph back.
   * - **a string** — that agent, running now. `$ codex` typed into a plain shell
   *   lands here.
   *
   * Collapsing absent and `null` into one value would make every agent session
   * flash a terminal glyph before its first probe arrived — see
   * `resolveSessionAgentId`, which is where the three cases are actually read.
   *
   * Runtime only, never persisted: the stored `agentId` stays the record of what
   * the user asked for.
   */
  liveAgentId: Record<string, string | null>;
  /**
   * The shell's foreground process, named from the process tree (Theme E),
   * not reconstructed from keystrokes.
   *
   * `null` means "probed, and the shell is back at a bare prompt" — read by
   * the row's `X` confirm to decide whether a foreground command is running.
   * Naming (`autoNames`, via `setAutoName`) is a separate, HELD concern: a
   * `null` here never clears a session's auto-name, it only means nothing new
   * to name it after. Absent means never probed.
   */
  foregroundCommand: Record<string, string | null>;
  /**
   * Bumped to move keyboard focus into the active session's xterm without
   * changing which session is active.
   *
   * `setActive` alone does not do this: `TerminalView`'s focus effect only
   * fires when `active`/`ready` themselves change, so re-selecting the
   * already-active row (the session list's own "focus the panel" arrow key)
   * would otherwise be a no-op. A counter is the plainest thing to add to that
   * effect's dependency list that means "focus again" regardless of value.
   */
  focusSignal: number;
  /**
   * True for one render after the session list's own arrow-key navigation
   * changes `activeId`, so `TerminalView`'s focus-follows-selection effect
   * knows to skip stealing focus back out of the list.
   *
   * That effect (`if (active && ready) termRef.current?.focus()`) exists so a
   * *click* on a different row leaves you able to type immediately — but the
   * list's own up/down navigation wants the opposite: stay in the list until
   * an explicit sideways arrow hands focus to the pane. Consumed by the effect
   * the moment it sees it true, so it never leaks into the next real click.
   */
  suppressAutoFocus: boolean;

  hydrate: () => Promise<void>;
  openSession: (request: NewSessionRequest) => TerminalSession;
  queueInput: (sessionId: string, input: string) => void;
  /** Consumed on pty creation — one paste per queue, never on a revive. */
  clearPendingInput: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;
  setActive: (sessionId: string) => void;
  /** Same as `setActive`, but keeps keyboard focus in the session list. */
  setActiveFromListNav: (sessionId: string) => void;
  /** Consumes `suppressAutoFocus` once `TerminalView`'s effect has seen it. */
  clearSuppressAutoFocus: () => void;
  /** Moves keyboard focus into the active session's terminal. See `focusSignal`. */
  focusActiveSession: () => void;
  reorder: (sessionIds: string[]) => void;
  /** The user's own name for a session — persisted. `undefined` clears it. */
  renameSession: (sessionId: string, name: string | undefined) => void;
  setAutoName: (sessionId: string, name: string) => void;
  setActivity: (sessionId: string, activity: SessionActivity | undefined) => void;
  /**
   * From the OSC 7 handler in `terminal-view.tsx`. Never persisted.
   *
   * `undefined` clears it, which is what a pty exit does: the next shell is
   * spawned at `session.cwd`, not wherever the last one wandered to.
   */
  setLiveCwd: (sessionId: string, cwd: string | undefined) => void;
  /**
   * From `pty:agent-changed`. `undefined` clears it back to *never probed*,
   * which is what a pty exit does — the answer belonged to a dead process.
   */
  setLiveAgentId: (sessionId: string, agentId: string | null | undefined) => void;
  /**
   * From `pty:command-changed`. A non-null command also updates the
   * session's auto-name for a shell; `null` updates only this map, so the
   * displayed name is held rather than cleared when the shell returns to a
   * bare prompt.
   */
  setForegroundCommand: (sessionId: string, command: string | null) => void;

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
  reattachedCount: 0,
  reattachedAt: 0,
  ptyIds: {},
  states: {},
  replay: {},
  errors: {},
  pendingInput: {},
  autoNames: {},
  activity: {},
  liveCwd: {},
  liveAgentId: {},
  foregroundCommand: {},
  focusSignal: 0,
  suppressAutoFocus: false,

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
      const liveEntries = sessions.flatMap((e) =>
        e.live ? [{ sessionId: e.session.id, ptyId: e.live.ptyId }] : [],
      );

      return {
        hydrated: true,
        sessions: [...restored, ...live],
        // A session opened by hand outranks the restored list for focus: the
        // user asked for it seconds ago, and the saved ones have no process.
        activeId: live.length > 0 ? state.activeId : (restored[0]?.id ?? null),
        states: {
          ...Object.fromEntries(restored.map((s) => [s.id, 'exited' as const])),
          // A live row binds straight to 'open' — it survived whatever
          // happened to the renderer, and there is no process to revive.
          ...Object.fromEntries(liveEntries.map((e) => [e.sessionId, 'open' as const])),
          ...state.states,
        },
        ptyIds: {
          ...Object.fromEntries(liveEntries.map((e) => [e.sessionId, e.ptyId])),
          ...state.ptyIds,
        },
        replay: Object.fromEntries(
          sessions
            // A live row gets no replay entry: `terminal-view.tsx`'s mount
            // fetches the ring buffer itself (`pty:snapshot`, Theme A) rather
            // than replaying the disk-restored transcript this array holds —
            // that transcript predates whatever the still-running pty has
            // printed since.
            .filter((e) => e.live === null && e.scrollback.length > 0)
            .map((e) => [e.session.id, e.scrollback]),
        ),
        reattachedCount: liveEntries.length,
        reattachedAt: liveEntries.length > 0 ? Date.now() : state.reattachedAt,
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

  setActiveFromListNav: (activeId) => set({ activeId, suppressAutoFocus: true }),

  clearSuppressAutoFocus: () => set({ suppressAutoFocus: false }),

  focusActiveSession: () => set((state) => ({ focusSignal: state.focusSignal + 1 })),

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
      const cleaned = cleanAutoName(name);
      if (cleaned === undefined) return state;
      if (state.autoNames[sessionId] === cleaned) return state;
      return { autoNames: { ...state.autoNames, [sessionId]: cleaned } };
    }),

  setLiveCwd: (sessionId, cwd) =>
    set((state) => {
      if (state.liveCwd[sessionId] === cwd) return state;
      const next = { ...state.liveCwd };
      if (cwd === undefined) delete next[sessionId];
      else next[sessionId] = cwd;
      return { liveCwd: next };
    }),

  setLiveAgentId: (sessionId, agentId) =>
    set((state) => {
      const known = sessionId in state.liveAgentId;
      if (agentId === undefined ? !known : known && state.liveAgentId[sessionId] === agentId) {
        return state;
      }
      const next = { ...state.liveAgentId };
      if (agentId === undefined) delete next[sessionId];
      else next[sessionId] = agentId;
      return { liveAgentId: next };
    }),

  setForegroundCommand: (sessionId, command) =>
    set((state) => {
      if (state.foregroundCommand[sessionId] === command) return state;
      return { foregroundCommand: { ...state.foregroundCommand, [sessionId]: command } };
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
  | 'ptyIds'
  | 'states'
  | 'replay'
  | 'errors'
  | 'pendingInput'
  | 'autoNames'
  | 'activity'
  | 'liveCwd'
  | 'liveAgentId'
  | 'foregroundCommand'
> {
  const ptyIds = { ...state.ptyIds };
  const states = { ...state.states };
  const replay = { ...state.replay };
  const errors = { ...state.errors };
  const pendingInput = { ...state.pendingInput };
  const autoNames = { ...state.autoNames };
  const activity = { ...state.activity };
  const liveCwd = { ...state.liveCwd };
  const liveAgentId = { ...state.liveAgentId };
  const foregroundCommand = { ...state.foregroundCommand };
  delete ptyIds[sessionId];
  delete states[sessionId];
  delete replay[sessionId];
  delete errors[sessionId];
  delete pendingInput[sessionId];
  delete autoNames[sessionId];
  delete activity[sessionId];
  delete liveCwd[sessionId];
  delete liveAgentId[sessionId];
  delete foregroundCommand[sessionId];
  return {
    ptyIds,
    states,
    replay,
    errors,
    pendingInput,
    autoNames,
    activity,
    liveCwd,
    liveAgentId,
    foregroundCommand,
  };
}

/**
 * Which agent a session should be *drawn* as, reading the tri-state above.
 *
 * Icons only, deliberately. `sessionLabel` already resolves four ways
 * (`name` → `autoName` → `agentLabel` → `'Terminal'`) and a fifth input into
 * that ordering wants its own design pass — so a plain shell running Codex gets
 * Codex's mark and keeps whatever it was called.
 *
 * Returns `undefined` for "no agent", which is the shape both `SessionIcon` and
 * the header already take for a bare terminal.
 */
export function resolveSessionAgentId(
  session: Pick<TerminalSession, 'id' | 'agentId'>,
  liveAgentId: Record<string, string | null>,
): string | undefined {
  // Absent means never probed — not "probed and found nothing".
  if (!(session.id in liveAgentId)) return session.agentId;
  return liveAgentId[session.id] ?? undefined;
}

/**
 * Anything an agent's window title is decorating itself WITH rather than
 * naming itself by: Claude Code's spinner asterisk (`✳`), the emoji and
 * dingbats other CLIs reach for, and Nerd Font glyphs from the private use
 * area.
 *
 * The joiners come first, as alternatives rather than class members. A
 * variation selector or a ZWJ inside a character class is what
 * `no-misleading-character-class` exists to catch — they combine with the
 * neighbouring codepoint rather than standing as one — but they still have to
 * be removed: strip the parts of a multi-codepoint emoji and the glue left
 * behind renders as a stray box.
 */
const DECORATIVE_GLYPHS =
  /\u{FE0E}|\u{FE0F}|\u{200D}|\u{20E3}|[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{E000}-\u{F8FF}]/gu;

/**
 * A window title, reduced to the words in it.
 *
 * An agent's OSC title is written for a terminal tab, not for this list: Claude
 * Code prefixes its own with the spinner glyph it animates in the TUI, which
 * arrives here as a coloured emoji square sitting where an icon already is —
 * the row's Claude mark says which agent this is, so the copy of it inside the
 * label was only noise. Nerd Font powerline separators come through the private
 * use area for the same reason and go the same way.
 *
 * Returns `undefined` when nothing legible survives, so a title that was ONLY
 * decoration leaves the previous guess standing rather than blanking the row.
 */
export function cleanAutoName(name: string): string | undefined {
  const stripped = name
    .replace(DECORATIVE_GLYPHS, '')
    // Collapse what the removal left behind — a stripped prefix leaves a
    // leading space, and `✳ ✳ name` left two.
    .replace(/\s+/g, ' ')
    .trim();
  return stripped === '' ? undefined : stripped;
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
