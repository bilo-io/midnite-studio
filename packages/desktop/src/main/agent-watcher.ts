import type { AgentDefinition } from '@midnite/studio-shared';

import {
  commandLabel,
  foregroundOf,
  matchRunningAgent,
  readProcessRows,
  type ProcessRow,
} from './agent-process';

/**
 * When to look at a pty's process tree, and what to tell the renderer.
 *
 * `agent-process.ts` next door knows how to *read* the process table; this
 * module decides *when*, remembers what it last said, and speaks only when the
 * answer changes.
 *
 * ## Why this is its own file
 *
 * `terminal-service.ts` already imports `pty-service.ts` (for the scrollback),
 * so the roster this needs cannot be reached from inside `pty-service` without
 * making that a cycle. Every dependency arrives injected instead, which is also
 * what makes the cadence testable: a debounce asserted through a real 750ms
 * timer is a slow test that passes for the wrong reasons.
 *
 * ## The cadence, and why it is not a poll
 *
 * Event-driven: a pty's output resets its own quiet timer, and the probe runs
 * once output has been silent for {@link QUIET_MS}. Typing `codex` and waiting
 * for it to boot therefore costs exactly one probe — the boot chatter keeps
 * resetting the timer, and the answer is taken once the agent is sitting at its
 * prompt. A background session's icon can lag until it prints something, which
 * is the cheap failure; a timer across every open pty is a subprocess every few
 * seconds, forever, for a fact that changes a handful of times a day.
 *
 * ## Why nothing is probed at open
 *
 * At `pty.create` time the tree is a login shell and nothing else — the agent's
 * command is typed in only once the shell has printed a prompt. A probe there
 * would confidently answer "nothing running" for a session that is about to run
 * Claude Code, and the renderer would drop the row's mark for a moment before
 * putting it back. So the *declared* `agentId` seeds the last-known value
 * instead, and a probe that agrees with the seed stays silent. A probe that
 * finds *nothing* where the seed named an agent is refused outright: a `null`
 * may only take away a mark some probe has actually seen. The reasoning is in
 * `probe` — briefly, a timed grace period would eventually strip the mark off a
 * running agent whose process form the matcher will not guess at, which is worse
 * than never having probed.
 */

/**
 * How long output must be silent before the tree is worth reading.
 *
 * Raised from 750 by Phase 36 Theme G, which is the first time the number was
 * costed rather than guessed. `readProcessRows` shells out to
 * `ps -axo pid=,ppid=,stat=,args=` — the *whole* process table — and on this
 * machine that is a median **30.6 ms of CPU** (user+sys of the child, median of
 * 20). A chatty pty resets this timer continuously and so sustains one probe per
 * window indefinitely:
 *
 *   750 ms  → 80 probes/min → 2 448 ms CPU/min → **4.08% of one core**
 *   1500 ms → 40 probes/min → 1 224 ms CPU/min → **2.04% of one core**
 *
 * 4% of a core, forever, to keep an icon in step is not a trade this app should
 * make; the theme's threshold was "measurable", and 4% is not close to the line.
 * What is bought back is a slower mark: an agent that starts and then falls quiet
 * gets its icon up to 750 ms later than before. That is the right side of the
 * trade for a fact the header describes as changing "a handful of times a day".
 *
 * {@link ROWS_TTL_MS} must stay below this, and a test asserts it — raising this
 * value keeps that invariant true by construction, which is the direction that
 * cannot break it.
 */
export const QUIET_MS = 1500;

/**
 * How long one `ps` read is reused across ptys.
 *
 * Several terminals going quiet within the same moment is the normal case — a
 * build finishing frees them all at once — and each one wants the same snapshot
 * of the same process table. Short enough that the answer is never meaningfully
 * stale, long enough that the common case is one subprocess rather than one per
 * terminal.
 *
 * **Must stay below {@link QUIET_MS}**, and a test asserts it. A probe fires
 * `QUIET_MS` after the last output, so a snapshot reused at the TTL's limit was
 * still taken *after* whatever that output was announcing. Raise this above
 * `QUIET_MS` and "the agent just started" becomes answerable from a snapshot
 * taken before it did — in both directions, with nothing else failing.
 */
export const ROWS_TTL_MS = 250;

/** What `pty-service` calls; see {@link createAgentWatcher} for the real one. */
export type AgentWatcher = {
  /**
   * A pty exists. `declaredAgentId` seeds the last-known value, so a session
   * opened for an agent does not momentarily report having none.
   */
  track: (ptyId: string, pid: number, declaredAgentId: string | null) => void;
  /** Output arrived — restart this pty's quiet timer. */
  noteOutput: (ptyId: string) => void;
  /** The pty is gone. Cancels any pending probe; emits nothing. */
  untrack: (ptyId: string) => void;
  /**
   * The best-known answer to "what agent is running in this pty right now" —
   * the seed if never observed, `null` if none, an id if one is running.
   *
   * Reads the same `lastKnown` a probe writes; used by the activity detector
   * to pick which agent's markers apply to a chunk, without a second probe.
   */
  currentAgentId: (ptyId: string) => string | null;
};

export type AgentWatcherDeps = {
  /** The whole process table, or null if it could not be read. */
  readRows: () => Promise<ProcessRow[] | null>;
  /** The roster, merged with the user's `agents.json`. */
  listRoster: () => Promise<readonly AgentDefinition[]>;
  /** Send the change to the renderer. Called only when the answer differs. */
  emit: (event: { ptyId: string; agentId: string | null }) => void;
  /**
   * Send a foreground-command change to the renderer. Called only when the
   * answer differs — same change-only contract as {@link emit}, same
   * QUIET_MS/ROWS_TTL_MS cadence, and read off the SAME `ps` snapshot rather
   * than a second read.
   */
  emitCommand: (event: { ptyId: string; command: string | null }) => void;
  /** `setTimeout`, as a seam — a test drives the debounce rather than waiting. */
  setTimer: (fn: () => void, ms: number) => Timer;
  /** `Date.now`, as a seam for the shared-read TTL. */
  now: () => number;
};

export type Timer = { cancel: () => void };

type Tracked = {
  pid: number;
  /** What the renderer was last told, or seeded with. Never re-sent. */
  lastKnown: string | null;
  /**
   * True once a probe has actually *seen* `lastKnown` in the process tree.
   *
   * A seeded value starts out unobserved — it is what the session was opened
   * for, not something anybody looked at — and that distinction is what guards
   * the mark. See the `null`-vs-seed rule in `probe`.
   */
  observed: boolean;
  pending: Timer | null;
  /**
   * The foreground command last sent, or `null` for "never probed / at a
   * bare prompt". Unlike `lastKnown`, there is no seed and no grace window —
   * a shell's own naming has nothing to protect against a matcher that
   * cannot recognise a form, since it names whatever `ps` actually shows.
   */
  lastCommand: string | null;
};

export function createAgentWatcher(deps: AgentWatcherDeps): AgentWatcher {
  const tracked = new Map<string, Tracked>();

  /**
   * One `ps` shared across everything that asks inside the TTL.
   *
   * The in-flight promise is cached, not just the result: two ptys going quiet
   * in the same tick would otherwise both start a read before either finished,
   * which is the exact case the TTL is meant to collapse.
   */
  let cached: { at: number; rows: Promise<ProcessRow[] | null> } | null = null;

  const rowsNow = (): Promise<ProcessRow[] | null> => {
    const at = deps.now();
    if (cached && at - cached.at < ROWS_TTL_MS) return cached.rows;
    const rows = deps.readRows();
    cached = { at, rows };
    return rows;
  };

  const probe = async (ptyId: string): Promise<void> => {
    const entry = tracked.get(ptyId);
    if (!entry) return;
    entry.pending = null;

    const [rows, roster] = await Promise.all([rowsNow(), deps.listRoster()]);
    /*
      A read that failed says nothing, and saying nothing is the right answer:
      reporting `null` on a machine where `ps` is unavailable would strip every
      agent session's mark on the first keystroke. The session keeps whatever it
      last knew.
    */
    if (!rows) return;

    // Re-read: the pty can exit while the process table is being read.
    const still = tracked.get(ptyId);
    if (!still) return;

    /*
      The foreground command, off the SAME snapshot rather than a second `ps`
      read — change-only, and with none of the agentId grace window below: a
      shell's name has nothing to protect, since it names whatever `ps`
      actually shows rather than guessing at a roster match.
    */
    const fg = foregroundOf(rows, still.pid);
    const command = fg ? commandLabel(fg.args) : null;
    if (command !== still.lastCommand) {
      still.lastCommand = command;
      deps.emitCommand({ ptyId, command });
    }

    const agentId = matchRunningAgent(rows, still.pid, roster);
    if (agentId === still.lastKnown) {
      // Seen for real now, so the grace window below no longer applies.
      still.observed = true;
      return;
    }

    /*
      A `null` may only take away a mark this probe has actually SEEN.

      Two distinct cases would otherwise lose a correct mark, and the second one
      is the reason this is a permanent rule rather than a timed grace period:

      - **Cold start.** The agent's command is written on the shell's first
        output chunk. If the shell then prints nothing for QUIET_MS while a
        binary starts up, the first probe lands on a bare login shell and
        honestly reports `null` for a session one moment away from running the
        agent. A few seconds of grace would cover this.

      - **A form the matcher will not guess at.** `npm i -g` puts Claude Code at
        `node …/@anthropic-ai/claude-code/cli.js`, and `agent-process.ts` matches
        path segments EXACTLY — `claude-code` is not `claude` — so it answers
        `null` for an agent that is genuinely running, deliberately. On such a
        machine the seed is never observed and no amount of waiting changes
        that, so a timed window would eventually strip Claude's mark off a live
        Claude Code session: strictly worse than not probing at all.

      So the stored `agentId` stays what the phase doc calls it — "the fallback
      and the persisted truth". An agent session whose agent the matcher cannot
      recognise keeps its mark for the session's life, exactly as before this
      existed. What it costs: a session opened for an agent that never started
      also keeps its mark, over a `command not found` the user can read on the
      screen right beside it. That is the cheap half of the trade.

      A plain shell is seeded `null`, so nothing here applies to it — an agent
      typed in by hand is reported as soon as it is seen, and reported gone as
      soon as it goes.
    */
    if (agentId === null && still.lastKnown !== null && !still.observed) return;

    still.lastKnown = agentId;
    still.observed = true;
    deps.emit({ ptyId, agentId });
  };

  return {
    track: (ptyId, pid, declaredAgentId) => {
      tracked.set(ptyId, {
        pid,
        lastKnown: declaredAgentId,
        observed: false,
        pending: null,
        lastCommand: null,
      });
    },

    noteOutput: (ptyId) => {
      const entry = tracked.get(ptyId);
      if (!entry) return;
      // Reset, not "start if idle": the point is silence, and a chatty terminal
      // should be read once it stops rather than in the middle of a build log.
      entry.pending?.cancel();
      entry.pending = deps.setTimer(() => void probe(ptyId), QUIET_MS);
    },

    untrack: (ptyId) => {
      const entry = tracked.get(ptyId);
      entry?.pending?.cancel();
      tracked.delete(ptyId);
    },

    currentAgentId: (ptyId) => tracked.get(ptyId)?.lastKnown ?? null,
  };
}

/** The real seams: `ps`, the roster, `setTimeout` and the clock. */
export function realAgentWatcherDeps(
  listRoster: () => Promise<readonly AgentDefinition[]>,
  emit: (event: { ptyId: string; agentId: string | null }) => void,
  emitCommand: (event: { ptyId: string; command: string | null }) => void,
): AgentWatcherDeps {
  return {
    readRows: readProcessRows,
    listRoster,
    emit,
    emitCommand,
    setTimer: (fn, ms) => {
      const handle = setTimeout(fn, ms);
      // Bookkeeping about what is on screen must never hold the process open.
      handle.unref?.();
      return { cancel: () => clearTimeout(handle) };
    },
    now: () => Date.now(),
  };
}
