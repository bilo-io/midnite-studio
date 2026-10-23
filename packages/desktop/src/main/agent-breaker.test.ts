import type { AgentAuditRecord, AgentLimitTrip } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { agentLimitsSettingsReader, spendTokens, startAgentBreaker } from './agent-breaker';

const SESSION = { id: 's1', agentId: 'claude', title: 'T', cwd: '/work/app/pkg' };
const call = (n: number): AgentAuditRecord => ({ id: `r${n}`, at: 1_000 + n, sessionId: 's1', kind: 'mcp-call', tool: 'x', repoPath: '/r', ok: true, ms: 1 });

function wire(records: AgentAuditRecord[], settings: Parameters<typeof startAgentBreaker>[0]['settings']) {
  const trips: AgentLimitTrip[] = [];
  const interrupt = vi.fn(async () => true);
  const running = startAgentBreaker({
    reader: () => ({ readSince: async () => ({ records, cursor: null }) }) as never,
    record: () => undefined,
    raiseFinding: async () => undefined,
    emitTrip: (t) => void trips.push(t),
    interrupt,
    stop: async () => true,
    session: async () => SESSION,
    settings,
    usage: async () => ({ input: 600, output: 300, cacheRead: 9_000_000, cacheCreate: 200 }),
    onSessionExit: () => () => undefined,
    pollMs: 3_600_000,
  });
  return { running, trips, interrupt };
}

describe('startAgentBreaker', () => {
  it('applies the per-repo override found from the session cwd', async () => {
    const { running, trips, interrupt } = wire([call(1), call(2), call(3)], async () => ({ defaults: {}, repos: { '/work/app': { toolCallsPerMinute: 2 } } }));
    await running.breaker.poll();
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ threshold: 2, observed: 3 });
    expect(interrupt).toHaveBeenCalledWith('s1');
    running.dispose();
  });

  it('reads spend as input + output + cache writes, never cache reads', async () => {
    expect(spendTokens({ input: 600, output: 300, cacheRead: 9_000_000, cacheCreate: 200 })).toBe(1_100);
    const { running, trips } = wire([call(1)], async () => ({ defaults: { spendTokensPerSession: 1_000 }, repos: {} }));
    await running.breaker.poll();
    expect(trips[0]).toMatchObject({ limit: 'spendTokensPerSession', observed: 1_100 });
    running.dispose();
  });

  it('a missing or malformed settings file means the defaults', async () => {
    expect(await agentLimitsSettingsReader('/nonexistent-dir-for-test')()).toBeUndefined();
  });
});
