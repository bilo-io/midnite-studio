import type { AgentDefinition, SessionActivity } from '@midnite/git-shared';

/** Enough to hold one repaint; a frame is a couple of kilobytes of escapes. */
const MAX_FRAME_CHARS = 8000;

/** After this many bytes with no frame boundary seen, the markers may be stale. */
const NO_BOUNDARY_WARN_BYTES = 64_000;

export type ActivityState = {
  frame: string;
  /** Bytes seen since the last frame-end match — reset to 0 on one. */
  bytesSinceBoundary: number;
  /** Whether the "markers may be stale" line has already fired for this session. */
  loggedNoBoundary: boolean;
};

export const createActivityState = (): ActivityState => ({
  frame: '',
  bytesSinceBoundary: 0,
  loggedNoBoundary: false,
});

export type CompiledMarkers = { thinking: RegExp; frameEnd: RegExp };

/**
 * Compile a roster entry's marker sources into the `RegExp`s `detectActivity`
 * actually runs.
 *
 * `frameEnd` needs the `g` flag for `matchAll` to walk every boundary in a
 * chunk; `thinking` deliberately does not carry one — a global flag on a
 * regex reused across `.test()` calls advances its own `lastIndex`, which
 * would make every other call on the same buffer silently skip matches.
 * `RegexSource`'s own compile check already ran at parse time, in
 * `AgentDefinitionSchema` — this only chooses the flags.
 */
export function compileMarkers(source: { thinking: string; frameEnd: string }): CompiledMarkers {
  return {
    thinking: new RegExp(source.thinking, 'i'),
    frameEnd: new RegExp(source.frameEnd, 'gi'),
  };
}

/**
 * Guesses at what an agent is doing, read off the same text a human would.
 *
 * There is no structured signal for this — an agent CLI is just a process
 * writing bytes to a pty — so the guess is keyed on markers the agent's own
 * roster entry supplies (`AgentDefinitionSchema.activity`). It cannot be keyed
 * on one CHUNK of that output, though: a repaint is a few kilobytes and a pty
 * hands it over in pieces, so the spinner row and the footer under it
 * routinely arrive separately. Judged chunk by chunk, the same repaint says
 * "thinking" and then "waiting" a millisecond later, and the indicator
 * flickers between the two for as long as the turn runs.
 *
 * So `state` carries the bytes since the last frame boundary, and the guess is
 * made over that instead: spinner seen since the last footer → thinking; a
 * footer reached with none → waiting. `undefined` means "no change" rather
 * than "unknown" — most chunks are transcript text that ends no frame and says
 * nothing either way, and the caller keeps its previous guess.
 */
export function detectActivity(
  state: ActivityState,
  text: string,
  markers: CompiledMarkers,
): SessionActivity | undefined {
  const buffer = state.frame + text;

  // Only the text after the LAST footer belongs to the frame still being
  // drawn. Slicing there rather than clearing the buffer wholesale is what
  // keeps a chunk that carries the tail of one frame and the head of the next
  // from crediting the older frame with the newer one's spinner.
  let framed = false;
  let current = buffer;
  for (const match of buffer.matchAll(markers.frameEnd)) {
    framed = true;
    current = buffer.slice((match.index ?? 0) + match[0].length);
  }

  state.frame = current.slice(-MAX_FRAME_CHARS);
  if (framed) state.bytesSinceBoundary = 0;
  // Buffer.byteLength, not text.length (UTF-16 code units) — the field and
  // the 64kB threshold are both named for what actually arrives on the wire,
  // and CJK output or multi-byte glyphs would otherwise undercount against it.
  else state.bytesSinceBoundary += Buffer.byteLength(text, 'utf8');

  // The frame still being drawn wins: it is the newer of the two, so an agent
  // that has just been given something to do says so on the first repaint
  // rather than one frame later.
  if (markers.thinking.test(current)) return 'thinking';
  if (!framed) return undefined;
  if (markers.thinking.test(buffer.slice(0, buffer.length - current.length))) return 'thinking';
  return 'waiting';
}

/**
 * Whether this session has gone `NO_BOUNDARY_WARN_BYTES` with no frame
 * boundary at all — the exact shape of the 2.1.x regression, where a marker
 * set silently stopped matching anything. Fires once per session.
 */
export function needsNoBoundaryWarning(state: ActivityState): boolean {
  if (state.loggedNoBoundary) return false;
  if (state.bytesSinceBoundary < NO_BOUNDARY_WARN_BYTES) return false;
  state.loggedNoBoundary = true;
  return true;
}

/** A guess that stands unanswered this long decays to the next rung down. */
const THINKING_TO_WAITING_MS = 10_000;
const WAITING_TO_IDLE_MS = 60_000;

/**
 * A guess expires: `thinking` → 10s of silence → `waiting` → 60s more →
 * `idle`. Today's caller kept its last guess forever, so a killed agent or a
 * marker that stopped matching left a spinner turning until the session
 * closed.
 *
 * One shared clock drives every tracked pty (`tick()` on a single 1s
 * interval) rather than a timer each. Each threshold is measured from when
 * the CURRENT rung was entered — whether by a real detection (`saw()`) or by
 * the previous decay step — not from the original detection: a session whose
 * very first guess is `'waiting'` (no `'thinking'` before it) still decays to
 * `'idle'` after 60s of its own silence, not 70s borrowed from the
 * thinking→waiting leg it never climbed. `onChange` fires only when the rung
 * actually changes.
 */
export function createActivityClock(opts: {
  now: () => number;
  onChange: (activity: SessionActivity) => void;
}): { saw: (activity: SessionActivity) => void; tick: () => void; dispose: () => void } {
  let current: SessionActivity | null = null;
  let enteredAt = 0;
  let disposed = false;

  const set = (next: SessionActivity) => {
    if (disposed) return;
    if (current !== next) {
      current = next;
      opts.onChange(next);
    }
  };

  return {
    saw: (activity) => {
      if (disposed) return;
      // Any detection resets the clock, even a repeated one — a chatty
      // "still thinking" chunk should push the decay out just as much as the
      // first.
      enteredAt = opts.now();
      set(activity);
    },
    tick: () => {
      if (disposed || current === null || current === 'idle') return;
      const quiet = opts.now() - enteredAt;
      if (current === 'thinking' && quiet >= THINKING_TO_WAITING_MS) {
        enteredAt = opts.now();
        set('waiting');
      } else if (current === 'waiting' && quiet >= WAITING_TO_IDLE_MS) {
        enteredAt = opts.now();
        set('idle');
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
}

/** Three consecutive calls slower than this disable that agent's detector. */
const TIME_BUDGET_MS = 2;
const STRIKES_TO_DISABLE = 3;

export type ActivityDetector = {
  /** Whether this agent has a compiled, still-enabled detector. */
  hasDetector: (agentId: string) => boolean;
  /**
   * Run the detector for one chunk of one session's output. Returns
   * `undefined` when there is nothing to report — no marker set, the
   * detector was disabled, or the chunk simply says nothing new.
   */
  guess: (agentId: string, state: ActivityState, text: string) => SessionActivity | undefined;
};

/**
 * Build the roster's compiled markers once, and the per-agent time-budget
 * breaker beside them.
 *
 * Compiled once rather than per chunk: a user-authored pattern in
 * `agents.json` sits in the hottest path in the app, so `new RegExp` cannot
 * run per pty chunk. `onDisabled` fires once, synchronously, the moment an
 * agent's third slow call disables it — the caller uses it to tell every
 * session currently running that agent, rather than leaving their last guess
 * spinning forever.
 */
export function createActivityDetector(
  agents: readonly AgentDefinition[],
  deps: {
    now: () => number;
    log: (message: string) => void;
    onDisabled: (agentId: string) => void;
  },
): ActivityDetector {
  const markers = new Map<string, CompiledMarkers>();
  for (const agent of agents) {
    if (!agent.activity) continue;
    markers.set(agent.id, compileMarkers(agent.activity));
  }

  const strikes = new Map<string, number>();
  const disabled = new Set<string>();

  return {
    hasDetector: (agentId) => markers.has(agentId) && !disabled.has(agentId),

    guess: (agentId, state, text) => {
      if (disabled.has(agentId)) return undefined;
      const compiled = markers.get(agentId);
      if (!compiled) return undefined;

      const start = deps.now();
      const result = detectActivity(state, text, compiled);
      const elapsed = deps.now() - start;

      if (elapsed > TIME_BUDGET_MS) {
        const count = (strikes.get(agentId) ?? 0) + 1;
        strikes.set(agentId, count);
        if (count >= STRIKES_TO_DISABLE) {
          disabled.add(agentId);
          deps.log(
            `[activity] detector for ${agentId} disabled after ${elapsed.toFixed(1)}ms — pattern too slow`,
          );
          deps.onDisabled(agentId);
        }
      } else {
        strikes.set(agentId, 0);
      }

      if (needsNoBoundaryWarning(state)) {
        deps.log(
          `[activity] no frame boundary for ${agentId} in ${Math.round(state.bytesSinceBoundary / 1000)}kB — markers may be stale`,
        );
      }

      return result;
    },
  };
}
