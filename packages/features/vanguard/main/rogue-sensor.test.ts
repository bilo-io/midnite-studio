import type { AgentAuditCursor, AgentAuditRecord, NewSecurityFinding, SecurityFinding } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createAutoPause } from './rogue-pause';
import { createRogueAgentSensor } from './rogue-sensor';
import type { SensorContext } from './sensor-host';

function harness(opts: { open?: string[]; changes?: SecurityFinding[]; severities?: ('critical' | 'high')[] } = {}) {
  const batches: AgentAuditRecord[][] = [];
  const reader = {
    readSince: async (cursor: AgentAuditCursor | null) =>
      cursor === null
        ? { records: [] as AgentAuditRecord[], cursor: { file: 'f', offset: 0 } }
        : { records: batches.shift() ?? [], cursor: { file: 'f', offset: 1 } },
  };
  const recorded: Omit<NewSecurityFinding, 'source'>[] = [];
  const ctx = {
    homeDir: '/Users/me',
    now: () => 200_000,
    record: async (f: Omit<NewSecurityFinding, 'source'>) => {
      recorded.push(f);
      return { ...f, id: `id${recorded.length}` } as unknown as SecurityFinding;
    },
  } as unknown as SensorContext;
  const interrupt = vi.fn(async () => true);
  const announce = vi.fn();
  const sensor = createRogueAgentSensor({
    reader,
    liveSessions: () => [{ sessionId: 's1', cwd: '/Users/me/work/repo', title: 'Claude' }],
    openFingerprints: async () => new Set(opts.open ?? []),
    recentChanges: async () => opts.changes ?? [],
    autoPause: createAutoPause({ severities: () => opts.severities ?? ['critical'], interrupt, announce }),
  });
  return { sensor, ctx, batches, recorded, interrupt, announce };
}

const command = (c: string): AgentAuditRecord => ({ id: 'r', at: 195_000, kind: 'command', sessionId: 's1', command: c, source: 'osc-133', cwd: '/Users/me/work/repo' });

describe('rogue agent sensor', () => {
  it('starts at the end of the trail and raises nothing from history', async () => {
    const h = harness();
    await h.sensor.start?.(h.ctx);
    await h.sensor.run?.(h.ctx);
    expect(h.recorded).toEqual([]);
  });

  it('a keychain read is recorded critical and pauses the session', async () => {
    const h = harness();
    await h.sensor.start?.(h.ctx);
    h.batches.push([command('security find-generic-password -s x -w')]);
    await h.sensor.run?.(h.ctx);
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0]).toMatchObject({ severity: 'critical', sessionId: 's1' });
    expect(h.interrupt).toHaveBeenCalledExactlyOnceWith('s1');
    expect(h.announce).toHaveBeenCalledOnce();
  });

  it('a high finding records but does not pause by default', async () => {
    const h = harness();
    await h.sensor.start?.(h.ctx);
    h.batches.push([command('git reset --hard HEAD~1')]);
    await h.sensor.run?.(h.ctx);
    expect(h.recorded).toHaveLength(1);
    expect(h.interrupt).not.toHaveBeenCalled();
  });

  it('a limit trip is judged one pass later and not raised again when the breaker already did', async () => {
    const trip: AgentAuditRecord = { id: 'l', at: 195_000, kind: 'limit-trip', sessionId: 's1', limit: 'toolCallsPerMinute', observed: 121, threshold: 120 };
    const covered = harness({ open: ['agents:limit-trip:s1:toolCallsPerMinute'] });
    await covered.sensor.start?.(covered.ctx);
    covered.batches.push([trip]);
    await covered.sensor.run?.(covered.ctx);
    await covered.sensor.run?.(covered.ctx);
    expect(covered.recorded).toEqual([]);

    const alone = harness();
    await alone.sensor.start?.(alone.ctx);
    alone.batches.push([trip]);
    await alone.sensor.run?.(alone.ctx);
    expect(alone.recorded).toEqual([]);
    await alone.sensor.run?.(alone.ctx);
    expect(alone.recorded).toHaveLength(1);
    expect(alone.recorded[0]).toMatchObject({ severity: 'medium' });
  });

  it('correlates a new persistence item with the session that was active', async () => {
    const change: SecurityFinding = {
      id: 'p1', fingerprint: 'persistence:x', source: 'vanguard', severity: 'high', category: 'persistence', title: 'New LaunchAgent',
      detail: '', evidence: [], remediation: [], firstSeen: 190_000, lastSeen: 190_000, count: 1, status: 'open',
    };
    const h = harness({ changes: [change] });
    await h.sensor.start?.(h.ctx);
    h.batches.push([command('ls')]);
    await h.sensor.run?.(h.ctx);
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0]).toMatchObject({ severity: 'high', sessionId: 's1' });
    h.batches.push([command('ls')]);
    await h.sensor.run?.(h.ctx);
    expect(h.recorded).toHaveLength(1); // not raised twice
  });
});
