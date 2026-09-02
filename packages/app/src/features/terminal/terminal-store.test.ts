import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanAutoName,
  isAgentRow,
  resolveSessionAgentId,
  sessionLabel,
  sessionPhase,
  useTerminalStore,
} from './terminal-store';

/**
 * The store's own logic, with no bridge behind it.
 *
 * `bridge()` returns undefined under jsdom, so every `terminal.save` /
 * `pty.kill` call is a no-op here — which is the point: these tests are about
 * what the renderer believes, not about what main is told.
 */
const reset = () =>
  useTerminalStore.setState({
    sessions: [],
    activeId: null,
    hydrated: false,
    ptyIds: {},
    states: {},
    replay: {},
    errors: {},
    activity: {},
    activityAt: {},
  });

const open = (title: string) =>
  useTerminalStore.getState().openSession({
    kind: 'shell',
    title,
    cwd: `/repos/${title}`,
    repoId: `repo:${title}`,
  });

describe('useTerminalStore', () => {
  beforeEach(reset);

  it('makes a newly opened session the active one', () => {
    const first = open('alpha');
    expect(useTerminalStore.getState().activeId).toBe(first.id);

    const second = open('beta');
    expect(useTerminalStore.getState().activeId).toBe(second.id);
    expect(useTerminalStore.getState().sessions).toHaveLength(2);
  });

  it('records an agent session with its roster id', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'midnite',
      cwd: '/repos/midnite',
      repoId: 'repo:midnite',
    });

    expect(session.kind).toBe('agent');
    expect(session.agentId).toBe('claude');
  });

  /**
   * Closing the middle of three should leave you in a terminal, not on an empty
   * panel — the neighbour is what the user was next to.
   */
  it('falls back to the next session when the active one closes', () => {
    const a = open('a');
    const b = open('b');
    const c = open('c');

    useTerminalStore.getState().setActive(b.id);
    useTerminalStore.getState().closeSession(b.id);

    expect(useTerminalStore.getState().activeId).toBe(c.id);
    expect(useTerminalStore.getState().sessions.map((s) => s.id)).toEqual([a.id, c.id]);
  });

  it('falls back to the previous session when the last one closes', () => {
    const a = open('a');
    const b = open('b');

    useTerminalStore.getState().closeSession(b.id);
    expect(useTerminalStore.getState().activeId).toBe(a.id);
  });

  it('leaves nothing active once the last session closes', () => {
    const only = open('only');
    useTerminalStore.getState().closeSession(only.id);

    expect(useTerminalStore.getState().activeId).toBeNull();
    expect(useTerminalStore.getState().sessions).toEqual([]);
  });

  it('drops the closed session runtime state, so an id cannot be reused stale', () => {
    const a = open('a');
    useTerminalStore.getState().bindPty(a.id, 'pty-1');
    useTerminalStore.getState().setState(a.id, 'open');

    useTerminalStore.getState().closeSession(a.id);

    expect(useTerminalStore.getState().ptyIds[a.id]).toBeUndefined();
    expect(useTerminalStore.getState().states[a.id]).toBeUndefined();
  });

  /*
    Structural, not a hand-written field list (Phase 45 Theme E) — the
    previous version of this test named the maps to check, which is exactly
    the failure mode `dropKey` itself has: a Pick<> of twelve names that
    quietly drifted to miss `legacy`, the thirteenth. This version derives
    "which fields are per-session maps" from the state object itself, after
    seeding: any top-level value that is a plain object carrying `a.id` as an
    own key. A future fourteenth map only has to be SEEDED below to be
    covered here — it never needs a second, parallel name added anywhere.
  */
  it('leaves no runtime state behind in any per-session map', () => {
    const a = open('a');
    const store = useTerminalStore.getState();
    store.bindPty(a.id, 'pty-1');
    store.setState(a.id, 'open');
    store.queueInput(a.id, 'ls\r');
    store.setAutoName(a.id, 'building');
    store.setActivity(a.id, 'thinking');
    store.setLiveCwd(a.id, '/tmp/elsewhere');
    store.setExitCode(a.id, 0);
    /*
      `replay`/`errors`/`legacy` have no dedicated setter (written only by
      `hydrate`, a failed spawn, or a restored legacy session respectively),
      so they are seeded directly.
    */
    useTerminalStore.setState((state) => ({
      replay: { ...state.replay, [a.id]: new Uint8Array([1]) },
      errors: { ...state.errors, [a.id]: 'spawn failed' },
      legacy: { ...state.legacy, [a.id]: true },
    }));
    // A string rather than the tri-state's `null`, so the "still present"
    // check below means what it says.
    useTerminalStore.getState().setLiveAgentId(a.id, 'codex');
    store.setForegroundCommand(a.id, 'pnpm dev');

    const before = useTerminalStore.getState() as unknown as Record<string, unknown>;
    const perSessionKeys = Object.keys(before).filter((key) => {
      const value = before[key];
      return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.prototype.hasOwnProperty.call(value, a.id)
      );
    });
    // Non-vacuous: the seeding above must actually have produced some maps to check.
    expect(perSessionKeys.length).toBeGreaterThan(0);

    useTerminalStore.getState().closeSession(a.id);

    const after = useTerminalStore.getState() as unknown as Record<string, Record<string, unknown>>;
    const stillPresent = perSessionKeys.filter((key) =>
      Object.prototype.hasOwnProperty.call(after[key], a.id),
    );
    expect(stillPresent).toEqual([]);
  });

  it('applies a new order', () => {
    const a = open('a');
    const b = open('b');
    const c = open('c');

    useTerminalStore.getState().reorder([c.id, a.id, b.id]);

    expect(useTerminalStore.getState().sessions.map((s) => s.id)).toEqual([c.id, a.id, b.id]);
  });

  /**
   * A replay survives being read, and retires when a shell takes over.
   *
   * It used to be consumed on the first read, on the grounds that a remount
   * would otherwise double it. But a remount builds a NEW xterm with an empty
   * screen, so replaying into it is right every time — and consuming it meant
   * the second mount found nothing, came up blank, and (reading "no replay" as
   * "brand new session") started a shell nobody had asked to revive. Under
   * StrictMode that is every mount.
   */
  it('hands out a replay buffer as often as a new terminal asks for it', () => {
    const a = open('a');
    const bytes = new TextEncoder().encode('restored output');
    useTerminalStore.setState({ replay: { [a.id]: bytes } });

    expect(useTerminalStore.getState().peekReplay(a.id)).toEqual(bytes);
    expect(useTerminalStore.getState().peekReplay(a.id)).toEqual(bytes);
  });

  it('retires the replay once a live shell owns the screen', () => {
    // Past this point the pty is writing the screen, so the transcript from the
    // last run is history a remount should not paint over it.
    const a = open('a');
    useTerminalStore.setState({ replay: { [a.id]: new TextEncoder().encode('old') } });

    useTerminalStore.getState().bindPty(a.id, 'pty-1');
    expect(useTerminalStore.getState().peekReplay(a.id)).toBeNull();
  });

  it('reports no replay for a session that never had one', () => {
    const a = open('a');
    expect(useTerminalStore.getState().peekReplay(a.id)).toBeNull();
  });

  it('records an error alongside the unavailable state', () => {
    const a = open('a');
    useTerminalStore.getState().setState(a.id, 'unavailable', 'node-pty missing');

    expect(useTerminalStore.getState().states[a.id]).toBe('unavailable');
    expect(useTerminalStore.getState().errors[a.id]).toBe('node-pty missing');
  });

  describe('renameSession', () => {
    it('sets a custom name that outranks the live guess', () => {
      const a = open('a');
      useTerminalStore.getState().setAutoName(a.id, 'git status');
      useTerminalStore.getState().renameSession(a.id, 'Rebase onto main');

      const session = useTerminalStore.getState().sessions.find((s) => s.id === a.id)!;
      expect(session.name).toBe('Rebase onto main');
      expect(sessionLabel(session, useTerminalStore.getState().autoNames[a.id])).toBe(
        'Rebase onto main',
      );
    });

    it('clears the custom name back to the live guess on an undefined rename', () => {
      const a = open('a');
      useTerminalStore.getState().setAutoName(a.id, 'git status');
      useTerminalStore.getState().renameSession(a.id, 'Rebase onto main');
      useTerminalStore.getState().renameSession(a.id, undefined);

      const session = useTerminalStore.getState().sessions.find((s) => s.id === a.id)!;
      expect(session.name).toBeUndefined();
      expect(sessionLabel(session, useTerminalStore.getState().autoNames[a.id])).toBe(
        'git status',
      );
    });
  });

  describe('setAutoName', () => {
    it('strips the agent spinner glyph out of the title it reports', () => {
      const a = open('a');
      useTerminalStore.getState().setAutoName(a.id, '\u2733 Claude Code');

      expect(useTerminalStore.getState().autoNames[a.id]).toBe('Claude Code');
    });

    it('keeps the previous guess when a title is nothing but decoration', () => {
      const a = open('a');
      useTerminalStore.getState().setAutoName(a.id, 'Rebasing');
      useTerminalStore.getState().setAutoName(a.id, '\u2733');

      expect(useTerminalStore.getState().autoNames[a.id]).toBe('Rebasing');
    });
  });

  describe('setLiveCwd', () => {
    it('records where the shell says it is', () => {
      const a = open('a');
      useTerminalStore.getState().setLiveCwd(a.id, '/tmp/other-repo');
      expect(useTerminalStore.getState().liveCwd[a.id]).toBe('/tmp/other-repo');
    });

    /*
      A shell whose prompt re-announces the same directory on every Enter must
      not re-render anything. The handler debounces the burst; this is the
      backstop for the value that survives it.
    */
    it('is a no-op for an unchanged path, so nothing re-renders', () => {
      const a = open('a');
      useTerminalStore.getState().setLiveCwd(a.id, '/tmp/other-repo');
      const first = useTerminalStore.getState().liveCwd;

      useTerminalStore.getState().setLiveCwd(a.id, '/tmp/other-repo');
      expect(useTerminalStore.getState().liveCwd).toBe(first);
    });

    /*
      The dead shell's directory dies with it: a revive respawns at
      `session.cwd`, so a value left over from the last process would have the
      header naming a directory the new shell is not in. `use-terminal-ipc`
      calls this on `pty:exit`.
    */
    it('clears on undefined, for a pty that has exited', () => {
      const a = open('a');
      useTerminalStore.getState().setLiveCwd(a.id, '/tmp/other-repo');
      useTerminalStore.getState().setLiveCwd(a.id, undefined);
      expect(useTerminalStore.getState().liveCwd[a.id]).toBeUndefined();
      expect(a.id in useTerminalStore.getState().liveCwd).toBe(false);
    });

    it('never touches the session record, which stays the opened-at truth', () => {
      const a = open('a');
      useTerminalStore.getState().setLiveCwd(a.id, '/tmp/somewhere-else');

      const session = useTerminalStore.getState().sessions.find((s) => s.id === a.id)!;
      expect(session.cwd).toBe(a.cwd);
      expect(session.repoId).toBe(a.repoId);
    });
  });

  describe('setLiveAgentId', () => {
    it('records what main says is running', () => {
      const a = open('a');
      useTerminalStore.getState().setLiveAgentId(a.id, 'codex');
      expect(useTerminalStore.getState().liveAgentId[a.id]).toBe('codex');
    });

    /**
     * The tri-state's whole point: `null` is an *answer*, so it has to be
     * stored as a present key. Storing it as an absence would read as "never
     * probed" and hand the row back the mark the probe just took away.
     */
    it('stores an explicit null as a present key, not as an absence', () => {
      const a = open('a');
      useTerminalStore.getState().setLiveAgentId(a.id, null);

      expect(useTerminalStore.getState().liveAgentId[a.id]).toBeNull();
      expect(a.id in useTerminalStore.getState().liveAgentId).toBe(true);
    });

    it('clears back to never-probed on undefined, for a pty that has exited', () => {
      const a = open('a');
      useTerminalStore.getState().setLiveAgentId(a.id, null);
      useTerminalStore.getState().setLiveAgentId(a.id, undefined);

      expect(a.id in useTerminalStore.getState().liveAgentId).toBe(false);
    });

    it.each([['codex'], [null]] as const)('is a no-op when %s is re-reported', (value) => {
      const a = open('a');
      useTerminalStore.getState().setLiveAgentId(a.id, value);
      const first = useTerminalStore.getState().liveAgentId;

      useTerminalStore.getState().setLiveAgentId(a.id, value);
      expect(useTerminalStore.getState().liveAgentId).toBe(first);
    });

    it('is a no-op when clearing a session that was never probed', () => {
      const a = open('a');
      const first = useTerminalStore.getState().liveAgentId;

      useTerminalStore.getState().setLiveAgentId(a.id, undefined);
      expect(useTerminalStore.getState().liveAgentId).toBe(first);
    });

    it('never touches the session record, which stays the opened-for truth', () => {
      const a = open('a');
      useTerminalStore.getState().setLiveAgentId(a.id, 'codex');

      const session = useTerminalStore.getState().sessions.find((s) => s.id === a.id)!;
      expect(session.kind).toBe('shell');
      expect(session.agentId).toBeUndefined();
    });
  });

  describe('setActivity', () => {
    it('records and clears a session activity guess', () => {
      const a = open('a');
      useTerminalStore.getState().setActivity(a.id, 'thinking');
      expect(useTerminalStore.getState().activity[a.id]).toBe('thinking');

      useTerminalStore.getState().setActivity(a.id, undefined);
      expect(useTerminalStore.getState().activity[a.id]).toBeUndefined();
    });

    it('accepts the widened idle arm', () => {
      const a = open('a');
      useTerminalStore.getState().setActivity(a.id, 'idle');
      expect(useTerminalStore.getState().activity[a.id]).toBe('idle');
    });

    it('stamps and clears activityAt alongside activity', () => {
      const a = open('a');
      useTerminalStore.getState().setActivity(a.id, 'thinking');
      expect(useTerminalStore.getState().activityAt[a.id]).toBeTypeOf('number');

      useTerminalStore.getState().setActivity(a.id, undefined);
      expect(useTerminalStore.getState().activityAt[a.id]).toBeUndefined();
    });
  });

  /**
   * Phase 30 Theme B: a saved row whose pty survived — a reload, or (Theme C)
   * a relaunch that reattached to the broker — binds straight to `'open'`
   * instead of the cold-restore `'exited'` path.
   */
  describe('hydrate', () => {
    const session = (id: string) => ({
      id,
      kind: 'shell' as const,
      title: 'midnite-studio',
      cwd: '/repos/midnite-studio',
      repoId: 'repo:midnite-studio',
      createdAt: 1_787_000_000,
    });

    const mockBridge = (
      sessions: {
        session: ReturnType<typeof session>;
        scrollback: Uint8Array;
        live: {
          ptyId: string;
          pid: number;
          cols: number;
          rows: number;
          activity?: 'thinking' | 'waiting' | 'idle' | null;
        } | null;
      }[],
      ptyCreate: () => void,
    ) => {
      (window as unknown as { midniteStudio: unknown }).midniteStudio = {
        terminal: { list: () => Promise.resolve({ sessions }) },
        pty: { create: ptyCreate },
      };
    };

    afterEach(() => {
      delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    });

    it('binds a live row without creating a pty', async () => {
      const ptyCreate = vi.fn();
      mockBridge(
        [
          {
            session: session('s-1'),
            scrollback: new Uint8Array(),
            live: { ptyId: 'pty-1', pid: 123, cols: 80, rows: 24 },
          },
        ],
        ptyCreate,
      );

      await useTerminalStore.getState().hydrate();

      const state = useTerminalStore.getState();
      expect(state.ptyIds['s-1']).toBe('pty-1');
      expect(state.states['s-1']).toBe('open');
      expect(state.replay['s-1']).toBeUndefined();
      expect(state.reattachedCount).toBe(1);
      expect(ptyCreate).not.toHaveBeenCalled();
    });

    it('seeds a live row\u2019s activity from the snapshot \u2014 events only announce changes', async () => {
      mockBridge(
        [
          {
            session: session('s-1'),
            scrollback: new Uint8Array(),
            live: { ptyId: 'pty-1', pid: 123, cols: 80, rows: 24, activity: 'thinking' },
          },
        ],
        vi.fn(),
      );

      await useTerminalStore.getState().hydrate();

      const state = useTerminalStore.getState();
      expect(state.activity['s-1']).toBe('thinking');
      expect(state.activityAt['s-1']).toBeGreaterThan(0);
    });

    it('leaves activity unspoken when the snapshot has nothing to say', async () => {
      mockBridge(
        [
          {
            session: session('s-1'),
            scrollback: new Uint8Array(),
            live: { ptyId: 'pty-1', pid: 123, cols: 80, rows: 24, activity: null },
          },
        ],
        vi.fn(),
      );

      await useTerminalStore.getState().hydrate();

      expect(useTerminalStore.getState().activity['s-1']).toBeUndefined();
    });

    it('marks a dead row exited with its replay', async () => {
      const scrollback = new TextEncoder().encode('$ git status\r\n');
      mockBridge(
        [{ session: session('s-2'), scrollback, live: null }],
        vi.fn(),
      );

      await useTerminalStore.getState().hydrate();

      const state = useTerminalStore.getState();
      expect(state.ptyIds['s-2']).toBeUndefined();
      expect(state.states['s-2']).toBe('exited');
      expect(state.replay['s-2']).toEqual(scrollback);
      expect(state.reattachedCount).toBe(0);
    });
  });
});

describe('sessionLabel', () => {
  const base = {
    id: 's1',
    kind: 'shell' as const,
    title: 'midnite-studio',
    cwd: '/repos/midnite-studio',
    repoId: 'repo:midnite-studio',
    createdAt: 0,
  };

  it('prefers the persisted name over everything else', () => {
    expect(sessionLabel({ ...base, name: 'Build' }, 'git log', 'Claude')).toBe('Build');
  });

  it('falls back to the live guess when there is no custom name', () => {
    expect(sessionLabel(base, 'git log', 'Claude')).toBe('git log');
  });

  it('falls back to the agent label when nothing else is known', () => {
    expect(sessionLabel(base, undefined, 'Claude')).toBe('Claude');
  });

  it('falls back to a plain "Terminal" for an unnamed shell', () => {
    expect(sessionLabel(base, undefined)).toBe('Terminal');
  });
});

/**
 * The three cases the tri-state exists for, read as the UI reads them.
 *
 * Absent is not `null`: the first is "nobody has looked", which must leave an
 * agent session wearing the mark it was opened with, and the second is "looked,
 * found nothing", which must take it away.
 */
describe('resolveSessionAgentId', () => {
  it('falls back to the opened-for agent when nothing has been probed', () => {
    expect(resolveSessionAgentId({ id: 's1', agentId: 'claude' }, {})).toBe('claude');
  });

  it('shows nothing for an unprobed plain shell', () => {
    expect(resolveSessionAgentId({ id: 's1', agentId: undefined }, {})).toBeUndefined();
  });

  it('prefers what is running over what the session was opened for', () => {
    expect(resolveSessionAgentId({ id: 's1', agentId: 'claude' }, { s1: 'codex' })).toBe('codex');
  });

  it('gives a plain shell the mark of the agent typed into it', () => {
    expect(resolveSessionAgentId({ id: 's1', agentId: undefined }, { s1: 'codex' })).toBe('codex');
  });

  /** An agent that has quit: the row gets its terminal glyph back. */
  it('takes the mark away when the probe found nothing running', () => {
    expect(resolveSessionAgentId({ id: 's1', agentId: 'claude' }, { s1: null })).toBeUndefined();
  });

  it("reads only its own session's entry", () => {
    expect(resolveSessionAgentId({ id: 's1', agentId: 'claude' }, { s2: null })).toBe('claude');
  });
});

describe('isAgentRow', () => {
  it('is true for a session opened for an agent, unprobed', () => {
    expect(isAgentRow({ id: 's1', agentId: 'claude' }, {})).toBe(true);
  });

  it('is false for a plain shell, unprobed', () => {
    expect(isAgentRow({ id: 's1', agentId: undefined }, {})).toBe(false);
  });

  it('is true for a plain shell the probe found running an agent', () => {
    expect(isAgentRow({ id: 's1', agentId: undefined }, { s1: 'claude' })).toBe(true);
  });

  it('is false for an agent session the probe found has quit', () => {
    expect(isAgentRow({ id: 's1', agentId: 'claude' }, { s1: null })).toBe(false);
  });

  it("does not leak another session's probe entry", () => {
    expect(isAgentRow({ id: 's1', agentId: undefined }, { s2: 'claude' })).toBe(false);
  });
});

describe('cleanAutoName', () => {
  it.each([
    ['\u2733 Claude Code', 'Claude Code'],
    ['\u2733 Icon updates and terminal tidying', 'Icon updates and terminal tidying'],
    ['\u2728\uFE0F  Building', 'Building'],
    ['pnpm test', 'pnpm test'],
    ['feature/x \u2014 main', 'feature/x \u2014 main'],
  ])('%s reads as %s', (title, expected) => {
    expect(cleanAutoName(title)).toBe(expected);
  });

  it.each(['\u2733', '  ', '\u2733\uFE0F \u2728'])('has nothing to report for %s', (title) => {
    expect(cleanAutoName(title)).toBeUndefined();
  });
});

describe('sessionPhase', () => {
  it('returns asleep for legacy broker sessions', () => {
    expect(sessionPhase({ asleep: false, legacy: true }, 'open')).toBe('asleep');
  });

  it('returns asleep when session is flagged asleep regardless of connection state', () => {
    expect(sessionPhase({ asleep: true }, 'open')).toBe('asleep');
    expect(sessionPhase({ asleep: true }, 'exited')).toBe('asleep');
    expect(sessionPhase({ asleep: true }, undefined)).toBe('asleep');
  });

  it('returns live when connection state is open, starting, or idle', () => {
    expect(sessionPhase({ asleep: false }, 'open')).toBe('live');
    expect(sessionPhase({ asleep: false }, 'starting')).toBe('live');
    expect(sessionPhase({ asleep: false }, 'idle')).toBe('live');
    expect(sessionPhase({}, 'open')).toBe('live');
  });

  it('returns ended when connection state is exited, unavailable, or undefined', () => {
    expect(sessionPhase({ asleep: false }, 'exited')).toBe('ended');
    expect(sessionPhase({ asleep: false }, 'unavailable')).toBe('ended');
    expect(sessionPhase({ asleep: false }, undefined)).toBe('ended');
    expect(sessionPhase({}, undefined)).toBe('ended');
  });
});

describe('sleepSession and awakeSession', () => {
  beforeEach(reset);

  it('sleeps a session: sets asleep true, connection state exited, unbinds pty', () => {
    const s = open('work');
    useTerminalStore.getState().bindPty(s.id, 'pty-99');
    useTerminalStore.getState().setState(s.id, 'open');

    useTerminalStore.getState().sleepSession(s.id);

    const state = useTerminalStore.getState();
    const updated = state.sessions.find((entry) => entry.id === s.id);
    expect(updated?.asleep).toBe(true);
    expect(state.states[s.id]).toBe('exited');
    expect(state.ptyIds[s.id]).toBeUndefined();
    expect(sessionPhase(updated!, state.states[s.id])).toBe('asleep');
  });

  it('awakes an asleep session: clears asleep flag', () => {
    const s = open('work');
    useTerminalStore.getState().sleepSession(s.id);
    expect(useTerminalStore.getState().sessions.find((entry) => entry.id === s.id)?.asleep).toBe(
      true,
    );

    useTerminalStore.getState().awakeSession(s.id);
    expect(useTerminalStore.getState().sessions.find((entry) => entry.id === s.id)?.asleep).toBe(
      false,
    );
  });
});

describe('exitCodes tracking', () => {
  beforeEach(reset);

  it('records exitCode and clears it on bindPty or closeSession', () => {
    const s = open('work');
    useTerminalStore.getState().setExitCode(s.id, 137);
    expect(useTerminalStore.getState().exitCodes[s.id]).toBe(137);

    useTerminalStore.getState().bindPty(s.id, 'pty-new');
    expect(useTerminalStore.getState().exitCodes[s.id]).toBeUndefined();

    useTerminalStore.getState().setExitCode(s.id, 1);
    useTerminalStore.getState().closeSession(s.id);
    expect(useTerminalStore.getState().exitCodes[s.id]).toBeUndefined();
  });
});

