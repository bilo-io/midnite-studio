import type { SessionActivity } from '@midnite/studio-shared';

import { sessionPhase, useTerminalStore, type SessionPhase } from '../terminal/terminal-store';
import { useUiStore } from '../../store/ui-store';

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
  /** The pty is up: Stop is the button, and the glow is on. */
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

/** The status of one loop, by tab id. */
export function useLoopStatus(loopId: string): LoopStatus {
  const sessionId = useUiStore((s) => s.fabSessions[loopId]);
  const session = useTerminalStore((s) => s.sessions.find((row) => row.id === sessionId));
  const state = useTerminalStore((s) => (sessionId ? s.states[sessionId] : undefined));
  const activity = useTerminalStore((s) => (sessionId ? s.activity[sessionId] : undefined));

  if (!sessionId || !session) return IDLE;
  const phase = sessionPhase(session, state);
  const running = phase === 'live';
  return {
    sessionId,
    phase,
    activity,
    running,
    waiting: running && activity === 'waiting',
    thinking: running && activity === 'thinking',
  };
}

/**
 * Every loop's status at once, in the registry's own order — what the tab
 * strip's dots and the collapsed FAB's dots both read. One subscription over
 * the whole store rather than N `useLoopStatus` calls, because the FAB button
 * renders on every frame of the app and a hook-per-loop would multiply that.
 */
export function useAllLoopStatuses(loopIds: readonly string[]): LoopStatus[] {
  const fabSessions = useUiStore((s) => s.fabSessions);
  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const activity = useTerminalStore((s) => s.activity);

  return loopIds.map((loopId) => {
    const sessionId = fabSessions[loopId];
    const session = sessionId ? sessions.find((row) => row.id === sessionId) : undefined;
    if (!sessionId || !session) return IDLE;
    const phase = sessionPhase(session, states[sessionId]);
    const running = phase === 'live';
    const seen = activity[sessionId];
    return {
      sessionId,
      phase,
      activity: seen,
      running,
      waiting: running && seen === 'waiting',
      thinking: running && seen === 'thinking',
    };
  });
}
