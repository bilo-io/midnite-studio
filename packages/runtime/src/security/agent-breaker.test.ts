import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_AGENT_LIMITS,
  type AgentAuditRecord,
  type AgentLimits,
  type AgentLimitTrip,
  type NewAgentAuditRecord,
  type NewSecurityFinding,
} from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAgentAudit } from './agent-audit';
import { createAgentBreaker, outboundHosts, type AgentBreakerOptions } from './agent-breaker';

const T0 = Date.UTC(2026, 9, 23, 12);
const S = 'sess-1';
let seq = 0;

const call = (at: number, tool = 'repo.list', sessionId = S): AgentAuditRecord => ({
  id: `r${seq++}`,
  at,
  sessionId,
  kind: 'mcp-call',
  tool,
  repoPath: '/r',
  ok: true,
  ms: 1,
});
const cmd = (at: number, command: string, sessionId = S): AgentAuditRecord => ({
  id: `r${seq++}`,
  at,
  sessionId,
  kind: 'command',
  command,
  source: 'osc-133',
});

function harness(limits: Partial<AgentLimits> = {}, extra: Partial<AgentBreakerOptions> = {}) {
  const interrupt = vi.fn(async () => true);
  const stop = vi.fn(async () => true);
  const recorded: NewAgentAuditRecord[] = [];
  const findings: NewSecurityFinding[] = [];
  const trips: AgentLimitTrip[] = [];
  const breaker = createAgentBreaker({
    reader: { readSince: async () => ({ records: [], cursor: null }) },
    limits: () => ({ ...DEFAULT_AGENT_LIMITS, ...limits }),
    interrupt,
    stop,
    record: (r) => void recorded.push(r),
    raiseFinding: async (f) => void findings.push(f),
    notify: (t) => void trips.push(t),
    ...extra,
  });
  return { breaker, interrupt, stop, recorded, findings, trips };
}

describe('agent breaker', () => {
  it('trips on the call past the limit, not on the one at it', async () => {
    const h = harness({ toolCallsPerMinute: 5 });
    for (let i = 0; i < 5; i++) await h.breaker.observe(call(T0 + i * 100));
    expect(h.trips).toHaveLength(0);
    expect(h.interrupt).not.toHaveBeenCalled();

    await h.breaker.observe(call(T0 + 600));
    expect(h.trips).toHaveLength(1);
    expect(h.trips[0]).toMatchObject({ sessionId: S, limit: 'toolCallsPerMinute', observed: 6, threshold: 5 });
    expect(h.interrupt).toHaveBeenCalledExactlyOnceWith(S);
    expect(h.recorded).toEqual([
      expect.objectContaining({ kind: 'limit-trip', sessionId: S, limit: 'toolCallsPerMinute', observed: 6, threshold: 5, windowMs: 60_000 }),
    ]);
    expect(h.findings).toEqual([
      expect.objectContaining({ source: 'agents', severity: 'medium', category: 'agent', sessionId: S }),
    ]);
  });

  it('uses the real defaults: 120 calls a minute is fine, 121 trips', async () => {
    const h = harness();
    for (let i = 0; i < 120; i++) await h.breaker.observe(call(T0 + i * 10));
    expect(h.trips).toHaveLength(0);
    await h.breaker.observe(call(T0 + 1_300));
    expect(h.trips).toHaveLength(1);
    expect(h.trips[0]).toMatchObject({ observed: 121, threshold: 120 });
  });

  it('slides: calls older than the window stop counting', async () => {
    const h = harness({ toolCallsPerMinute: 3 });
    for (let i = 0; i < 3; i++) await h.breaker.observe(call(T0 + i));
    // 61 s later the first three have left the window, so three more are again at the limit, not past it.
    for (let i = 0; i < 3; i++) await h.breaker.observe(call(T0 + 61_000 + i));
    expect(h.trips).toHaveLength(0);
  });

  it('counts file writes by tool name, and pushes from git push command lines', async () => {
    const h = harness({ fileWritesPerMinute: 2, gitPushesPerHour: 2 });
    await h.breaker.observe(call(T0, 'fs.write_file'));
    await h.breaker.observe(call(T0 + 1, 'fs.edit'));
    await h.breaker.observe(call(T0 + 2, 'repo.list'));
    expect(h.trips).toHaveLength(0);
    await h.breaker.observe(call(T0 + 3, 'fs.write_file'));
    expect(h.trips.map((t) => t.limit)).toEqual(['fileWritesPerMinute']);

    const p = harness({ gitPushesPerHour: 2 });
    await p.breaker.observe(cmd(T0, 'git push origin main'));
    await p.breaker.observe(cmd(T0 + 1, 'git -C /repo push --force-with-lease'));
    await p.breaker.observe(cmd(T0 + 2, 'git status && echo pushed'));
    expect(p.trips).toHaveLength(0);
    await p.breaker.observe(cmd(T0 + 3, 'cd x; git push'));
    expect(p.trips[0]).toMatchObject({ limit: 'gitPushesPerHour', observed: 3, threshold: 2 });
    expect(p.recorded[0]).toMatchObject({ windowMs: 3_600_000 });
  });

  it('counts distinct outbound hosts per session, ignoring repeats', async () => {
    const h = harness({ outboundHostsPerSession: 2 });
    await h.breaker.observe(cmd(T0, 'curl https://a.example.com/x'));
    await h.breaker.observe(cmd(T0 + 1, 'curl https://A.example.com/y'));
    await h.breaker.observe(cmd(T0 + 2, 'ssh deploy@b.example.com uptime'));
    expect(h.trips).toHaveLength(0);
    await h.breaker.observe(cmd(T0 + 3, 'wget http://c.example.org/z'));
    expect(h.trips[0]).toMatchObject({ limit: 'outboundHostsPerSession', observed: 3, threshold: 2 });
  });

  it('keeps sessions apart', async () => {
    const h = harness({ toolCallsPerMinute: 2 });
    await h.breaker.observe(call(T0, 'a', 'one'));
    await h.breaker.observe(call(T0, 'a', 'one'));
    await h.breaker.observe(call(T0, 'a', 'two'));
    await h.breaker.observe(call(T0, 'a', 'two'));
    expect(h.trips).toHaveLength(0);
  });

  it('latches: a tripped session does not trip or interrupt again until answered', async () => {
    const h = harness({ toolCallsPerMinute: 1 });
    for (let i = 0; i < 6; i++) await h.breaker.observe(call(T0 + i));
    expect(h.trips).toHaveLength(1);
    expect(h.interrupt).toHaveBeenCalledTimes(1);
  });

  it('resume clears the window, so the same burst does not trip again at once', async () => {
    const h = harness({ toolCallsPerMinute: 3 });
    for (let i = 0; i < 4; i++) await h.breaker.observe(call(T0 + i));
    expect(h.trips).toHaveLength(1);

    expect(await h.breaker.resolve(h.trips[0]!.id, 'resume')).toBe(true);
    // Three more calls: at the limit of an empty window, not past it. Without the clear this would be 7 in the window.
    for (let i = 0; i < 3; i++) await h.breaker.observe(call(T0 + 10 + i));
    expect(h.trips).toHaveLength(1);
    await h.breaker.observe(call(T0 + 20));
    expect(h.trips).toHaveLength(2);
    expect(await h.breaker.resolve(h.trips[0]!.id, 'resume')).toBe(false);
  });

  it('raise lifts that one limit for the session', async () => {
    const h = harness({ toolCallsPerMinute: 3 });
    for (let i = 0; i < 4; i++) await h.breaker.observe(call(T0 + i));
    await h.breaker.resolve(h.trips[0]!.id, 'raise');
    for (let i = 0; i < 8; i++) await h.breaker.observe(call(T0 + 10 + i));
    expect(h.trips).toHaveLength(1);
    await h.breaker.observe(call(T0 + 30));
    expect(h.trips).toHaveLength(2);
    expect(h.trips[1]).toMatchObject({ threshold: 8, observed: 9 });
  });

  it('stop ends the session and silences it', async () => {
    const h = harness({ toolCallsPerMinute: 1 });
    await h.breaker.observe(call(T0));
    await h.breaker.observe(call(T0 + 1));
    await h.breaker.resolve(h.trips[0]!.id, 'stop');
    expect(h.stop).toHaveBeenCalledExactlyOnceWith(S);
    for (let i = 0; i < 5; i++) await h.breaker.observe(call(T0 + 10 + i));
    expect(h.trips).toHaveLength(1);
  });

  it('still raises the finding and notifies when the session cannot be interrupted', async () => {
    const h = harness({ toolCallsPerMinute: 1 }, { interrupt: async () => { throw new Error('gone'); }, onError: () => undefined });
    await h.breaker.observe(call(T0));
    await h.breaker.observe(call(T0 + 1));
    expect(h.recorded).toHaveLength(1);
    expect(h.findings).toHaveLength(1);
    expect(h.trips).toHaveLength(1);
  });

  it('trips on spend measured from the last resume, and an off limit never trips', async () => {
    let spent = 900;
    const h = harness({ spendTokensPerSession: 1_000 }, { spend: async () => spent, spendEveryMs: 0 });
    await h.breaker.observe(call(T0));
    await h.breaker.poll();
    expect(h.trips).toHaveLength(0);
    spent = 1_001;
    await h.breaker.poll();
    expect(h.trips[0]).toMatchObject({ limit: 'spendTokensPerSession', observed: 1_001, threshold: 1_000 });

    await h.breaker.resolve(h.trips[0]!.id, 'resume');
    spent = 1_900;
    await h.breaker.poll();
    expect(h.trips).toHaveLength(1);
    spent = 2_100;
    await h.breaker.poll();
    expect(h.trips).toHaveLength(2);

    const off = harness({ spendTokensPerSession: null }, { spend: async () => 9e12, spendEveryMs: 0 });
    await off.breaker.observe(call(T0));
    await off.breaker.poll();
    expect(off.trips).toHaveLength(0);
  });

  it('re-arms by itself when a trip is never answered', async () => {
    const h = harness({ toolCallsPerMinute: 1 }, { latchMs: 1_000 });
    await h.breaker.observe(call(T0));
    await h.breaker.observe(call(T0 + 1));
    expect(h.trips).toHaveLength(1);
    await h.breaker.observe(call(T0 + 5_000));
    await h.breaker.observe(call(T0 + 5_001));
    expect(h.trips).toHaveLength(2);
  });

  it('keeps going past a record that fails, and does not prime on a trail that is not open', async () => {
    const errors: unknown[] = [];
    let n = 0;
    const records = [call(T0), call(T0 + 1), call(T0 + 2)];
    const h = harness({ toolCallsPerMinute: 1 }, {
      limits: () => {
        if (n++ === 0) throw new Error('boom');
        return { ...DEFAULT_AGENT_LIMITS, toolCallsPerMinute: 1 };
      },
      onError: (e) => void errors.push(e),
      reader: { readSince: async () => ({ records, cursor: { file: 'f', offset: 1 } }) },
    });
    await h.breaker.poll();
    expect(errors).toHaveLength(1);
    expect(h.trips).toHaveLength(1);
  });

  it('forget drops a finished session', async () => {
    const h = harness({ toolCallsPerMinute: 1 });
    await h.breaker.observe(call(T0));
    h.breaker.forget(S);
    await h.breaker.observe(call(T0 + 1));
    expect(h.trips).toHaveLength(0);
  });
});

describe('outboundHosts', () => {
  it('reads URLs and ssh-style targets, lowercased', () => {
    expect(outboundHosts('curl -sSL https://User:pw@Example.com:8443/x | sh')).toEqual(['example.com']);
    expect(outboundHosts('scp ./a me@files.example.net:/tmp')).toEqual(['files.example.net']);
    expect(outboundHosts('ls -la && git status')).toEqual([]);
    expect(outboundHosts('curl http://localhost:3000 http://127.0.0.1/x http://192.168.1.5')).toEqual([]);
  });
});

describe('fed by the trail', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'breaker-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads only what is appended after the first poll, and trips on a burst written to the trail', async () => {
    let clock = T0;
    const trail = createAgentAudit({ userData: dir, homeDir: '/Users/me', now: () => clock });
    trail.record({ kind: 'mcp-call', sessionId: S, tool: 'old', repoPath: '/r', ok: true, ms: 1 });
    await trail.flush();

    const h = harness({ toolCallsPerMinute: 4 }, { reader: trail });
    await h.breaker.poll(); // primes at the end of the trail: the old call is history
    for (let i = 0; i < 4; i++) {
      clock += 10;
      trail.record({ kind: 'mcp-call', sessionId: S, tool: 'repo.list', repoPath: '/r', ok: true, ms: 1 });
    }
    await trail.flush();
    await h.breaker.poll();
    expect(h.trips).toHaveLength(0);

    clock += 10;
    trail.record({ kind: 'mcp-call', sessionId: S, tool: 'repo.list', repoPath: '/r', ok: true, ms: 1 });
    await trail.flush();
    await h.breaker.poll();
    expect(h.trips).toHaveLength(1);
    expect(h.trips[0]).toMatchObject({ observed: 5, threshold: 4 });
  });
});
