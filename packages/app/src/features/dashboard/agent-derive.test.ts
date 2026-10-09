import type { ClosedSession, LoopRunRecord } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { orderLoopRuns, recentlyClosed, SHELL_KEY, tallyAgentSessions } from './agent-derive';

const closed = (id: string, closedAt: number, agentId?: string) =>
  ({ id, closedAt, agentId }) as ClosedSession;
const run = (id: string, startedAt: number, status: LoopRunRecord['status']) =>
  ({ id, startedAt, status }) as LoopRunRecord;

describe('tallyAgentSessions', () => {
  it('counts live and closed per agent, busiest first, shells under their own key', () => {
    const rows = tallyAgentSessions(
      [
        { id: 's1', agentId: 'claude' },
        { id: 's2', agentId: 'claude' },
        { id: 's3', agentId: undefined },
      ],
      [{ agentId: 'codex' }, { agentId: 'codex' }, { agentId: 'codex' }, { agentId: undefined }],
      {},
    );
    expect(rows).toEqual([
      { agentId: 'codex', live: 0, closed: 3 },
      // A tie on total falls back to id order.
      { agentId: SHELL_KEY, live: 1, closed: 1 },
      { agentId: 'claude', live: 2, closed: 0 },
    ]);
  });

  it('lets the live process probe outrank the id a session was opened with', () => {
    const rows = tallyAgentSessions(
      [
        { id: 's1', agentId: undefined },
        { id: 's2', agentId: 'claude' },
      ],
      [],
      { s1: 'codex', s2: null },
    );
    expect(rows.map((r) => r.agentId).sort()).toEqual([SHELL_KEY, 'codex']);
  });

  it('is empty with nothing to tally', () => {
    expect(tallyAgentSessions([], [], {})).toEqual([]);
  });
});

describe('recentlyClosed', () => {
  it('sorts newest first, caps, and does not mutate its input', () => {
    const input = [closed('a', 1), closed('b', 3), closed('c', 2)];
    expect(recentlyClosed(input, 2).map((s) => s.id)).toEqual(['b', 'c']);
    expect(input.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('orderLoopRuns', () => {
  it('puts running runs first, then newest first, capped', () => {
    const rows = orderLoopRuns(
      [run('old-run', 1, 'running'), run('new-end', 9, 'exited'), run('mid', 5, 'stopped')],
      2,
    );
    expect(rows.map((r) => r.id)).toEqual(['old-run', 'new-end']);
  });
});
