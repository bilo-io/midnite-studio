import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import type { ProcessRow } from './agent-process';
import {
  createAgentWatcher,
  QUIET_MS,
  ROWS_TTL_MS,
  type AgentWatcherDeps,
  type Timer,
} from './agent-watcher';

/**
 * The cadence, driven by hand.
 *
 * Every seam is injected — `ps`, the roster, the clock and `setTimeout` — so
 * the debounce is asserted by advancing a fake clock rather than by sleeping
 * 750ms per case. A test that waits on real timers is slow *and* passes for the
 * wrong reasons: it cannot tell "debounced correctly" from "the machine was
 * busy".
 */

const SHELL_PID = 60_000;

/** A tiny controllable timer wheel: nothing fires until `advance` says so. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();

  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number): Timer => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return { cancel: () => pending.delete(id) };
    },
    /** Move time forward and run whatever came due, in scheduled order. */
    advance: (ms: number) => {
      now += ms;
      const due = [...pending.entries()]
        .filter(([, entry]) => entry.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, entry] of due) {
        pending.delete(id);
        entry.fn();
      }
    },
    pendingCount: () => pending.size,
  };
}

const shellOnly: ProcessRow[] = [{ pid: SHELL_PID, ppid: 1, stat: 'Ss+', args: '/bin/zsh -l' }];
const withClaude: ProcessRow[] = [
  ...shellOnly,
  { pid: 60_041, ppid: SHELL_PID, stat: 'S+', args: 'claude' },
];
const withCodex: ProcessRow[] = [
  ...shellOnly,
  { pid: 60_072, ppid: SHELL_PID, stat: 'S+', args: 'node /opt/homebrew/bin/codex' },
];

type Harness = {
  deps: AgentWatcherDeps;
  clock: ReturnType<typeof fakeClock>;
  emitted: { ptyId: string; agentId: string | null }[];
  emittedCommands: { ptyId: string; command: string | null }[];
  /** What the next `ps` read returns. `null` models a read that failed. */
  setRows: (rows: ProcessRow[] | null) => void;
  reads: () => number;
};

function harness(initial: ProcessRow[] | null = shellOnly): Harness {
  const clock = fakeClock();
  const emitted: { ptyId: string; agentId: string | null }[] = [];
  const emittedCommands: { ptyId: string; command: string | null }[] = [];
  let rows = initial;
  let reads = 0;

  return {
    clock,
    emitted,
    emittedCommands,
    setRows: (next) => {
      rows = next;
    },
    reads: () => reads,
    deps: {
      readRows: () => {
        reads += 1;
        return Promise.resolve(rows);
      },
      listRoster: () => Promise.resolve(BUILTIN_AGENTS),
      emit: (event) => emitted.push(event),
      emitCommand: (event) => emittedCommands.push(event),
      setTimer: clock.setTimer,
      now: clock.now,
    },
  };
}

/** Let the probe's awaited `readRows`/`listRoster` settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * The cache's safety depends on this, and nothing else enforces it.
 *
 * A probe fires `QUIET_MS` after the last output, so a snapshot reused at the
 * TTL's limit was still taken *after* whatever that output announced. Raise the
 * TTL above `QUIET_MS` and both "the agent just started" and "the agent just
 * quit" become answerable from a snapshot predating the event, with no other
 * test failing.
 */
it('reuses a process snapshot for less time than it waits for quiet', () => {
  expect(ROWS_TTL_MS).toBeLessThan(QUIET_MS);
});

describe('createAgentWatcher', () => {
  it('probes nothing until output has been quiet', async () => {
    const h = harness(withClaude);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, null);
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS - 1);
    await settle();

    expect(h.reads()).toBe(0);
    expect(h.emitted).toEqual([]);
  });

  it('reports an agent that started inside a plain shell', async () => {
    const h = harness(withCodex);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, null);
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS);
    await settle();

    expect(h.emitted).toEqual([{ ptyId: 'pty-1', agentId: 'codex' }]);
  });

  /**
   * The reason the timer is reset rather than started-if-idle. An agent booting
   * writes continuously; reading its tree mid-boot answers a question about a
   * process that is still starting.
   */
  it('restarts the wait on every chunk, so a chatty boot costs one probe', async () => {
    const h = harness(withClaude);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, null);
    for (let i = 0; i < 5; i += 1) {
      watcher.noteOutput('pty-1');
      h.clock.advance(QUIET_MS - 100);
      await settle();
    }
    expect(h.reads()).toBe(0);

    h.clock.advance(QUIET_MS);
    await settle();

    expect(h.reads()).toBe(1);
    expect(h.emitted).toEqual([{ ptyId: 'pty-1', agentId: 'claude' }]);
  });

  it('says nothing when the answer has not changed', async () => {
    const h = harness(withClaude);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, null);
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS);
    await settle();
    expect(h.emitted).toHaveLength(1);

    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS + ROWS_TTL_MS);
    await settle();

    // Read again, reported nothing: an idle terminal produces no traffic.
    expect(h.emitted).toHaveLength(1);
  });

  /**
   * The whole reason `track` takes a declared id. At pty-create time the tree is
   * a login shell and nothing else, so an unseeded watcher would emit `null` for
   * a session that is one prompt away from running Claude Code — and the row's
   * mark would blink off and back on.
   */
  it('does not contradict the agent a session was opened for', async () => {
    const h = harness(shellOnly);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, 'claude');
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS);
    await settle();

    // The shell has not run the command yet. Nothing to report.
    expect(h.emitted).toEqual([]);

    h.setRows(withClaude);
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS + ROWS_TTL_MS);
    await settle();

    // Still agrees with the seed, so still silent.
    expect(h.emitted).toEqual([]);
  });

  it('hands a session its terminal glyph back when its agent quits', async () => {
    const h = harness(withClaude);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, 'claude');
    // Seen running once, which is what retires the seed's grace window.
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS);
    await settle();
    expect(h.emitted).toEqual([]);

    h.setRows(shellOnly);
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS + ROWS_TTL_MS);
    await settle();

    expect(h.emitted).toEqual([{ ptyId: 'pty-1', agentId: null }]);
  });

  /**
   * The rule that replaced a timed grace period, and the reason it is permanent.
   *
   * `npm i -g` installs Claude Code as `node …/@anthropic-ai/claude-code/cli.js`,
   * which `agent-process.ts` deliberately does not match — `claude-code` is not
   * `claude`. On such a machine the seed is never observed and no amount of
   * waiting changes that, so a window that eventually expired would strip
   * Claude's mark off a session where Claude Code is genuinely running: strictly
   * worse than never having probed at all.
   */
  it('never lets an unseen null take away the mark a session was opened with', async () => {
    const h = harness(shellOnly);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, 'claude');

    // Twenty probes over a long session. The answer is always `null`, and it is
    // refused every time, because no probe has ever seen `claude` running.
    for (let i = 0; i < 20; i += 1) {
      watcher.noteOutput('pty-1');
      h.clock.advance(QUIET_MS + ROWS_TTL_MS);
      await settle();
    }

    expect(h.reads()).toBe(20);
    expect(h.emitted).toEqual([]);
  });

  /**
   * The price of that rule, stated so it is a decision on the record: a session
   * opened for an agent that never started keeps its mark too. The user has
   * `command not found` on the screen right beside it, which is the cheap half
   * of the trade — losing a *correct* mark is the expensive half.
   */
  it('keeps the mark of a declared agent that never started', async () => {
    const h = harness(shellOnly);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, 'openclaude');
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS);
    await settle();

    expect(h.emitted).toEqual([]);
  });

  /**
   * A *different* agent is not a `null`, so it is reported at once — the guard
   * protects a mark from being taken away, never from being corrected.
   */
  it('replaces an unseen declared agent with a different one it can see', async () => {
    const h = harness(withCodex);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, 'claude');
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS);
    await settle();

    expect(h.emitted).toEqual([{ ptyId: 'pty-1', agentId: 'codex' }]);
  });

  /**
   * A shell session is seeded with `null`, so there is nothing for the grace
   * window to protect — an agent typed in by hand must be reported as soon as it
   * is seen, not five seconds later.
   */
  it('does not delay the first answer for a plain shell', async () => {
    const h = harness(withCodex);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, null);
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS);
    await settle();

    expect(h.emitted).toEqual([{ ptyId: 'pty-1', agentId: 'codex' }]);
  });

  /**
   * A machine where `ps` is missing or restricted must lose the icon that
   * follows the shell and nothing else. Reporting `null` on a failed read would
   * strip every agent session's mark on the first keystroke.
   */
  it('says nothing at all when the process table cannot be read', async () => {
    const h = harness(null);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, 'claude');
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS);
    await settle();

    expect(h.emitted).toEqual([]);
  });

  it('shares one process-table read across terminals that go quiet together', async () => {
    const h = harness(withClaude);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, null);
    watcher.track('pty-2', SHELL_PID, null);
    watcher.noteOutput('pty-1');
    watcher.noteOutput('pty-2');
    h.clock.advance(QUIET_MS);
    await settle();

    expect(h.reads()).toBe(1);
    expect(h.emitted).toEqual([
      { ptyId: 'pty-1', agentId: 'claude' },
      { ptyId: 'pty-2', agentId: 'claude' },
    ]);
  });

  it('reads again once the shared snapshot has expired', async () => {
    const h = harness(withClaude);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, null);
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS);
    await settle();

    watcher.track('pty-2', SHELL_PID, null);
    watcher.noteOutput('pty-2');
    h.clock.advance(QUIET_MS + ROWS_TTL_MS);
    await settle();

    expect(h.reads()).toBe(2);
  });

  it('cancels a pending probe when the pty goes away', async () => {
    const h = harness(withClaude);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, null);
    watcher.noteOutput('pty-1');
    watcher.untrack('pty-1');
    h.clock.advance(QUIET_MS);
    await settle();

    expect(h.clock.pendingCount()).toBe(0);
    expect(h.reads()).toBe(0);
    expect(h.emitted).toEqual([]);
  });

  /**
   * The pty can exit while the process table is being read — the probe awaits
   * two promises before it has an answer. Emitting then would name an agent for
   * a session the renderer has already torn the runtime state off.
   */
  it('reports nothing for a pty that exited mid-probe', async () => {
    const h = harness(withClaude);
    const watcher = createAgentWatcher(h.deps);

    watcher.track('pty-1', SHELL_PID, null);
    watcher.noteOutput('pty-1');
    h.clock.advance(QUIET_MS);
    // Between the timer firing and the awaited read resolving.
    watcher.untrack('pty-1');
    await settle();

    expect(h.emitted).toEqual([]);
  });

  it('ignores output from a pty it was never told about', async () => {
    const h = harness(withClaude);
    const watcher = createAgentWatcher(h.deps);

    watcher.noteOutput('unknown');
    h.clock.advance(QUIET_MS);
    await settle();

    expect(h.reads()).toBe(0);
    expect(h.emitted).toEqual([]);
  });

  describe('foreground command (Theme E)', () => {
    const withPnpm: ProcessRow[] = [
      ...shellOnly,
      { pid: 60_220, ppid: SHELL_PID, stat: 'S+', args: 'pnpm dev' },
    ];

    it('reports a foreground command off the same snapshot as the agent probe', async () => {
      const h = harness(withPnpm);
      const watcher = createAgentWatcher(h.deps);

      watcher.track('pty-1', SHELL_PID, null);
      watcher.noteOutput('pty-1');
      h.clock.advance(QUIET_MS);
      await settle();

      expect(h.emittedCommands).toEqual([{ ptyId: 'pty-1', command: 'pnpm dev' }]);
      // One `ps` read served both answers.
      expect(h.reads()).toBe(1);
    });

    it('reports null once the shell returns to a bare prompt', async () => {
      const h = harness(withPnpm);
      const watcher = createAgentWatcher(h.deps);

      watcher.track('pty-1', SHELL_PID, null);
      watcher.noteOutput('pty-1');
      h.clock.advance(QUIET_MS);
      await settle();

      h.setRows(shellOnly);
      watcher.noteOutput('pty-1');
      h.clock.advance(QUIET_MS);
      await settle();

      expect(h.emittedCommands).toEqual([
        { ptyId: 'pty-1', command: 'pnpm dev' },
        { ptyId: 'pty-1', command: null },
      ]);
    });

    it('says nothing again when the command has not changed', async () => {
      const h = harness(withPnpm);
      const watcher = createAgentWatcher(h.deps);

      watcher.track('pty-1', SHELL_PID, null);
      watcher.noteOutput('pty-1');
      h.clock.advance(QUIET_MS);
      await settle();

      watcher.noteOutput('pty-1');
      h.clock.advance(QUIET_MS);
      await settle();

      expect(h.emittedCommands).toEqual([{ ptyId: 'pty-1', command: 'pnpm dev' }]);
    });

    it('has no grace window: a lost match reports null immediately, unlike agentId', async () => {
      const h = harness(withPnpm);
      const watcher = createAgentWatcher(h.deps);

      // Seeded with a declared agent — the agentId side would hold this
      // through an unrecognised form, but the command side has no such rule.
      watcher.track('pty-1', SHELL_PID, 'claude');
      watcher.noteOutput('pty-1');
      h.clock.advance(QUIET_MS);
      await settle();

      expect(h.emittedCommands).toEqual([{ ptyId: 'pty-1', command: 'pnpm dev' }]);
    });
  });

  describe('currentAgentId', () => {
    it('returns null for a pty never tracked', () => {
      const h = harness();
      const watcher = createAgentWatcher(h.deps);
      expect(watcher.currentAgentId('pty-1')).toBeNull();
    });

    it('returns the seed before any probe has run', () => {
      const h = harness();
      const watcher = createAgentWatcher(h.deps);
      watcher.track('pty-1', SHELL_PID, 'claude');
      expect(watcher.currentAgentId('pty-1')).toBe('claude');
    });

    it('returns what a probe observed, once one has run', async () => {
      const h = harness(withCodex);
      const watcher = createAgentWatcher(h.deps);
      watcher.track('pty-1', SHELL_PID, null);
      watcher.noteOutput('pty-1');
      h.clock.advance(QUIET_MS);
      await settle();

      expect(watcher.currentAgentId('pty-1')).toBe('codex');
    });

    it('forgets a pty once it is untracked', () => {
      const h = harness();
      const watcher = createAgentWatcher(h.deps);
      watcher.track('pty-1', SHELL_PID, 'claude');
      watcher.untrack('pty-1');
      expect(watcher.currentAgentId('pty-1')).toBeNull();
    });
  });
});
