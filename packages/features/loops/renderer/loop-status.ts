import type { SessionActivity, TerminalSession } from '@midnite/studio-shared';

import { sessionPhase, type ConnectionState, type SessionPhase } from '@midnite/studio-frame';

import { useLoopsState, useLoopsTerminal } from './use-loops-host-state';

/**
 * What one loop tab currently is, in the two facts every surface needs.
 *
 * `phase` is the session's honest phase (`terminal-store.ts`'s own
 * `sessionPhase`), so a loop that exited on its own reads as `ended` without
 * anyone writing that down; `activity` is Phase 21's classification of the
 * agent's own output. Both are derived, never stored — the bug this phase
 * exists to fix came from a component keeping its own copy of "which session
 * am I".
 */
export type LoopStatus = {
  sessionId: string | undefined;
  phase: SessionPhase | undefined;
  activity: SessionActivity | undefined;
  /** At least one of the loop's sessions has its pty up — the glow is on. */
  running: boolean;
  /** The agent has a question on screen — amber everywhere it shows. */
  waiting: boolean;
  /** The agent is working — what makes the run glow breathe. */
  thinking: boolean;
};

const IDLE: LoopStatus = {
  sessionId: undefined,
  phase: undefined,
  activity: undefined,
  running: false,
  waiting: false,
  thinking: false,
};

type TerminalSlice = {
  sessions: readonly TerminalSession[];
  states: Record<string, ConnectionState>;
  activity: Record<string, SessionActivity>;
};

/**
 * One loop's status, folded over every session it dispatched.
 *
 * A loop can run several sessions at once now (each on its own feature), so
 * "the" status is the loudest one: waiting beats thinking beats merely live,
 * and the session reported is that one — the one worth opening. A session is
 * the loop's when it carries the loop's `loopId`, or — for a row persisted
 * before that field existed — when the old `fabSessions` map names it.
 */
export function foldLoopStatus(
  loopId: string,
  legacySessionId: string | undefined,
  terminal: TerminalSlice,
): LoopStatus {
  let best: LoopStatus = IDLE;
  let bestRank = -1;
  for (const session of terminal.sessions) {
    if (session.loopId !== loopId && session.id !== legacySessionId) continue;
    const phase = sessionPhase(session, terminal.states[session.id]);
    const running = phase === 'live';
    const activity = terminal.activity[session.id];
    const waiting = running && activity === 'waiting';
    const thinking = running && activity === 'thinking';
    // Later sessions win ties, so the newest dispatch is the one reported.
    const rank = waiting ? 3 : thinking ? 2 : running ? 1 : 0;
    if (rank >= bestRank) {
      bestRank = rank;
      best = { sessionId: session.id, phase, activity, running, waiting, thinking };
    }
  }
  return best;
}

/** The status of one loop, by tab id. */
export function useLoopStatus(loopId: string): LoopStatus {
  const legacySessionId = useLoopsState((s) => s.fabSessions[loopId]);
  const sessions = useLoopsTerminal((s) => s.sessions);
  const states = useLoopsTerminal((s) => s.states);
  const activity = useLoopsTerminal((s) => s.activity);
  return foldLoopStatus(loopId, legacySessionId, { sessions, states, activity });
}

/**
 * Every loop's status at once, in the registry's own order — what the tab
 * strip's dots and the collapsed FAB's dots both read. One subscription over
 * the whole store rather than N `useLoopStatus` calls, because the FAB button
 * renders on every frame of the app and a hook-per-loop would multiply that.
 */
export function useAllLoopStatuses(loopIds: readonly string[]): LoopStatus[] {
  const fabSessions = useLoopsState((s) => s.fabSessions);
  const sessions = useLoopsTerminal((s) => s.sessions);
  const states = useLoopsTerminal((s) => s.states);
  const activity = useLoopsTerminal((s) => s.activity);
  return loopIds.map((loopId) =>
    foldLoopStatus(loopId, fabSessions[loopId], { sessions, states, activity }),
  );
}
