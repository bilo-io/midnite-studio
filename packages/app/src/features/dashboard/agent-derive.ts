import type { ClosedSession, LoopRunRecord, TerminalSession } from '@midnite/studio-shared';

/**
 * Pure derivations behind the Agents dashboard's cards, so they test without a
 * DOM or a bridge.
 */

/** Sessions with no agent are tallied under this key ("Terminal"). */
export const SHELL_KEY = '__shell__';

export type AgentTally = { agentId: string; live: number; closed: number };

/**
 * Live and closed sessions per agent, busiest first.
 *
 * `liveAgentId` is the terminal store's probe of what is actually running — it
 * outranks the id a session was opened with, the same rule `isAgentRow` and the
 * Sessions view follow.
 */
export const tallyAgentSessions = (
  live: readonly Pick<TerminalSession, 'id' | 'agentId'>[],
  closed: readonly Pick<ClosedSession, 'agentId'>[],
  liveAgentId: Record<string, string | null>,
): AgentTally[] => {
  const tally = new Map<string, AgentTally>();
  const bump = (agentId: string, field: 'live' | 'closed'): void => {
    const row = tally.get(agentId) ?? { agentId, live: 0, closed: 0 };
    row[field] += 1;
    tally.set(agentId, row);
  };
  for (const session of live) {
    const resolved =
      session.id in liveAgentId ? (liveAgentId[session.id] ?? undefined) : session.agentId;
    bump(resolved ?? SHELL_KEY, 'live');
  }
  for (const session of closed) bump(session.agentId ?? SHELL_KEY, 'closed');
  return [...tally.values()].sort(
    (a, b) => b.live + b.closed - (a.live + a.closed) || a.agentId.localeCompare(b.agentId),
  );
};

/** Newest first, capped. */
export const recentlyClosed = (
  sessions: readonly ClosedSession[],
  limit: number,
): ClosedSession[] => [...sessions].sort((a, b) => b.closedAt - a.closedAt).slice(0, limit);

/** Running runs first, then by start time, newest first. */
export const orderLoopRuns = (runs: readonly LoopRunRecord[], limit: number): LoopRunRecord[] =>
  [...runs]
    .sort((a, b) => {
      const aRunning = a.status === 'running' ? 1 : 0;
      const bRunning = b.status === 'running' ? 1 : 0;
      return bRunning - aRunning || b.startedAt - a.startedAt;
    })
    .slice(0, limit);
