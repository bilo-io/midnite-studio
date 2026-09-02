import {
  findAnyCardSession,
  sessionPhase,
  useTerminalStore,
  type SessionActivity,
} from '../../terminal/terminal-store';

/**
 * A card's live session, derived the way `useLoopStatus` derives a loop
 * tab's (Phase 39) — never stored, so a card never keeps its own copy of
 * "which session am I" (the bug `loop-status.ts` was written to avoid).
 */
export type CardStatus = {
  sessionId: string | undefined;
  agentId: string | undefined;
  activity: SessionActivity | undefined;
  running: boolean;
  waiting: boolean;
  thinking: boolean;
};

const IDLE: CardStatus = {
  sessionId: undefined,
  agentId: undefined,
  activity: undefined,
  running: false,
  waiting: false,
  thinking: false,
};

export function useCardStatus(taskRef: { projectId: string; itemId: string }): CardStatus {
  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const activity = useTerminalStore((s) => s.activity);

  const session = findAnyCardSession(sessions, taskRef);
  if (!session) return IDLE;

  const phase = sessionPhase(session, states[session.id]);
  const running = phase === 'live';
  const sessionActivity = activity[session.id];
  return {
    sessionId: session.id,
    agentId: session.agentId,
    activity: sessionActivity,
    running,
    waiting: running && sessionActivity === 'waiting',
    thinking: running && sessionActivity === 'thinking',
  };
}
