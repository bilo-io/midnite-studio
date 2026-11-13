import type { AgentAuditRecord } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { behaviourCheck, type AuditTrailInput } from './behaviour';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 13, 15, 0).getTime();
const at = (daysAgo: number, hour: number): number => new Date(2026, 10, 13 - daysAgo, hour, 0).getTime();
let n = 0;
const cmd = (sessionId: string, t: number): AgentAuditRecord => ({ id: `r${n++}`, at: t, kind: 'command', sessionId } as unknown as AgentAuditRecord);
const approval = (sessionId: string, t: number, decision: 'approved' | 'denied'): AgentAuditRecord =>
  ({ id: `r${n++}`, at: t, kind: 'approval', sessionId, tool: 'bash', decision, by: 'user', rule: 'r' }) as AgentAuditRecord;
const limit = (sessionId: string, t: number): AgentAuditRecord =>
  ({ id: `r${n++}`, at: t, kind: 'limit-trip', sessionId, limit: 'tool-calls', observed: 120, threshold: 100 }) as AgentAuditRecord;

// Twelve baseline sessions, all started at 10:00 on earlier days.
const baseline = Array.from({ length: 12 }, (_, i) => cmd(`old${i}`, at(2 + i, 10)));
const trail = (records: AgentAuditRecord[]): AuditTrailInput => ({ records: [...baseline, ...records], windowStart: NOW - DAY, now: NOW });
const run = (t: AuditTrailInput, vanguardFindings?: unknown[]) =>
  behaviourCheck.run({ auditTrail: t, ...(vanguardFindings ? { vanguardFindings } : {}) }) as { fingerprint: string; severity: string }[];

describe('behaviour check', () => {
  it('a quiet week yields nothing', () => {
    expect(run(trail([cmd('today', at(0, 10)), approval('today', at(0, 10), 'denied')]))).toEqual([]);
    expect(run({ records: [], windowStart: NOW - DAY, now: NOW })).toEqual([]);
  });

  it('flags a session at an hour the baseline never saw, only once there is a baseline', () => {
    expect(run(trail([cmd('night', at(0, 3))])).map((f) => [f.fingerprint, f.severity])).toEqual([['behaviour:odd-hours:night', 'low']]);
    expect(run({ records: [cmd('night', at(0, 3))], windowStart: NOW - DAY, now: NOW })).toEqual([]);
  });

  it('links a Vanguard persistence finding that first appeared during a session', () => {
    const during = { fingerprint: 'launchd:evil', category: 'persistence', title: 'New LaunchAgent', firstSeen: at(0, 10) + 60_000, severity: 'high' };
    const outside = { fingerprint: 'launchd:other', category: 'persistence', title: 'Old', firstSeen: at(0, 12), severity: 'high' };
    const process = { fingerprint: 'proc:x', category: 'process', title: 'Proc', firstSeen: at(0, 10), severity: 'high' };
    const f = run(trail([cmd('s1', at(0, 10)), cmd('s1', at(0, 10) + 120_000)]), [during, outside, process]);
    expect(f.map((x) => [x.fingerprint, x.severity])).toEqual([['behaviour:during-session:s1:launchd:evil', 'high']]);
  });

  it('flags a limit trip and more than three denied approvals in one session', () => {
    const records = [limit('s2', at(0, 10)), ...[1, 2, 3, 4].map((i) => approval('s3', at(0, 10) + i, 'denied')), ...[1, 2, 3].map((i) => approval('s4', at(0, 10) + i, 'denied'))];
    expect(run(trail(records)).map((f) => f.fingerprint)).toEqual(['behaviour:limit-trip:s2:tool-calls', 'behaviour:denied-approvals:s3']);
  });
});
