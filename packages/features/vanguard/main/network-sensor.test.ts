import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_VANGUARD_SETTINGS,
  NETWORK_THREAT_HOSTS,
  NETWORK_UNREGISTERED_SUITE_SEVERITY,
  type NewSecurityFinding, type SecurityFinding } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createConnectionStore,
  createNetworkSensor,
  NETWORK_IDLE_MS,
  NETWORK_LIVE_MS,
  type NetworkAgentSession,
  type NetworkSensorDeps,
} from './network-sensor';
import type { NetworkResolver } from './network/resolver';
import type { SensorContext, SensorRunProcess, SensorTrigger } from './sensor-host';

/** One `lsof -F pcnPT` file set. */
const sock = (remote: string, state = 'ESTABLISHED', local = '10.0.0.5:50000') => `PTCP\nn${local}->${remote}\nTST=${state}`;
const lsofOutput = (processes: Array<{ pid: number; command: string; socks: string[] }>) =>
  processes.map((p) => [`p${p.pid}`, `c${p.command}`, ...p.socks].join('\n')).join('\n') + '\n';

const APP_PID = 100;
const BROKER_PID = 150;
const PS = [
  '    1     0 /sbin/launchd',
  `  ${APP_PID}     1 /Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio`,
  `  ${BROKER_PID}     1 /Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio /Resources/broker.js`,
  `  200   ${BROKER_PID} -zsh`,
  '  201   200 claude --resume',
  '  202   201 node /usr/local/bin/some-tool --flag',
  '  300     1 /usr/bin/ssh host',
].join('\n');

const SESSION: NetworkAgentSession = { sessionId: 's1', repoId: 'repo-1', pid: 200, title: 'Claude' };

let dir: string;
let lsof: string;
let calls: string[];
let recorded: Array<Omit<NewSecurityFinding, 'source'>>;
let signed: boolean;
let psOk: boolean;
let lsofFails: 'not-installed' | 'failed' | null;
let clock: number;

const runProcess: SensorRunProcess = async (command, args) => {
  calls.push(`${command} ${args.join(' ')}`.trim());
  if (command.endsWith('lsof')) {
    if (lsofFails) return { ok: false, reason: lsofFails, hint: 'boom' };
    return { ok: true, stdout: lsof, stderr: '', exitCode: 0 };
  }
  if (command.endsWith('/ps') && args[0] === '-o') return { ok: true, stdout: '/usr/local/bin/some-tool\n', stderr: '', exitCode: 0 };
  if (command.endsWith('/ps')) return psOk ? { ok: true, stdout: PS, stderr: '', exitCode: 0 } : { ok: false, reason: 'failed', hint: 'ps down' };
  if (command.endsWith('codesign')) return { ok: true, stdout: '', stderr: signed ? '' : 'code object is not signed at all', exitCode: signed ? 0 : 1 };
  return { ok: false, reason: 'failed', hint: 'unexpected' };
};

const ctx = (): SensorContext => ({
  userData: dir,
  homeDir: dir,
  now: () => clock,
  runProcess,
  record: async (finding) => {
    recorded.push(finding);
    return { ...finding, source: 'vanguard', id: `f${recorded.length}`, firstSeen: 0, lastSeen: 0, count: 1, status: 'open' } as SecurityFinding;
  },
  settings: () => DEFAULT_VANGUARD_SETTINGS,
  signal: new AbortController().signal,
  log: () => undefined,
});

/** Every name the sensor asked the resolver about, so a test can prove nothing observed was sent to it. */
let lookedUp: string[] = [];
const resolver = (forward: Record<string, string[]> = {}): NetworkResolver => ({
  lookup: async (host) => {
    lookedUp.push(host);
    return forward[host] ?? [];
  },
});

function make(overrides: Partial<NetworkSensorDeps> = {}) {
  const connections = createConnectionStore();
  const sensor = createNetworkSensor({
    connections,
    suite: { pid: APP_PID, brokerMarkers: ['/Resources/broker.js'] },
    agentSessions: () => [],
    windowFocused: () => true,
    resolver: resolver(),
    registry: { 'api.registry.example': { host: 'api.registry.example', owner: 'test', sends: 'x', trigger: 'user' } },
    ...overrides,
  });
  const run = async (trigger: SensorTrigger = 'manual') => {
    await sensor.start?.(ctx());
    return sensor.run!(ctx(), trigger);
  };
  return { sensor, connections, run };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vanguard-netsensor-'));
  lsof = '';
  calls = [];
  recorded = [];
  lookedUp = [];
  signed = true;
  psOk = true;
  lsofFails = null;
  clock = 1_000_000;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('the suite against the egress registry', () => {
  it('raises one info network finding for the app talking to a host the registry does not list', async () => {
    lsof = lsofOutput([
      { pid: APP_PID, command: 'Midnite', socks: [sock('203.0.113.7:443'), sock('104.16.0.1:443')] },
    ]);
    const { run, connections } = make({ resolver: resolver({ 'api.registry.example': ['104.16.0.1'] }) });
    const result = await run();
    expect(result).toEqual({ findings: 1 });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      severity: NETWORK_UNREGISTERED_SUITE_SEVERITY,
      category: 'network',
      fingerprint: 'network:suite:app:203.0.113.7:443',
    });
    expect(recorded[0]!.severity).toBe('info');
    expect(recorded[0]!.title).toMatch(/203\.0\.113\.7:443/);
    expect(recorded[0]!.evidence).toContainEqual({ kind: 'host', host: '203.0.113.7', port: 443, protocol: 'tcp' });
    const rows = connections.get().connections;
    expect(rows.find((r) => r.remoteHost === '104.16.0.1')).toMatchObject({ role: 'suite', allowedBy: 'api.registry.example' });
    expect(rows.find((r) => r.remoteHost === '203.0.113.7')).toMatchObject({ flagged: { severity: 'info' } });
  });

  it('reads the IPv6 form and the broker, found by its script path', async () => {
    lsof = lsofOutput([
      { pid: BROKER_PID, command: 'Midnite', socks: [sock('[2606:4700:4700::1111]:443', 'ESTABLISHED', '[2a01::5]:50000')] },
    ]);
    const { run } = make();
    await run();
    expect(recorded[0]).toMatchObject({ fingerprint: 'network:suite:broker:2606:4700:4700::1111:443' });
    expect(recorded[0]!.title).toMatch(/terminal broker/);
  });

  it('does not report the same open socket on the next pass, and does when it reappears', async () => {
    lsof = lsofOutput([{ pid: APP_PID, command: 'Midnite', socks: [sock('203.0.113.7:443')] }]);
    const { run } = make();
    await run();
    await run();
    expect(recorded).toHaveLength(1);
    lsof = lsofOutput([]);
    await run();
    lsof = lsofOutput([{ pid: APP_PID, command: 'Midnite', socks: [sock('203.0.113.7:443')] }]);
    await run();
    expect(recorded).toHaveLength(2);
  });

  it('ignores loopback, listeners, and processes that are not the suite or an agent', async () => {
    lsof = lsofOutput([
      { pid: APP_PID, command: 'Midnite', socks: [sock('127.0.0.1:5173'), 'PTCP\nn*:9000\nTST=LISTEN', sock('[::1]:3000')] },
      { pid: 300, command: 'ssh', socks: [sock('198.51.100.9:22')] },
    ]);
    const { run, connections } = make();
    expect(await run()).toEqual({ findings: 0 });
    expect(connections.get().connections).toMatchObject([{ pid: 300, role: 'other' }]);
  });

  it('holds nothing to the registry when the composer names no suite', async () => {
    lsof = lsofOutput([{ pid: APP_PID, command: 'Midnite', socks: [sock('203.0.113.7:443')] }]);
    const { run } = make({ suite: undefined });
    await run();
    expect(recorded).toEqual([]);
  });
});

describe('the registry lookup', () => {
  it('asks again soon when a registry host did not resolve, instead of trusting the gap', async () => {
    lsof = lsofOutput([{ pid: APP_PID, command: 'Midnite', socks: [sock('104.16.0.1:443')] }]);
    let online = false;
    const { run } = make({
      resolver: {
        lookup: async () => (online ? ['104.16.0.1'] : []),
      },
    });
    await run();
    expect(recorded).toHaveLength(1);
    online = true;
    clock += 61_000;
    recorded = [];
    await run();
    // Resolved on the retry: the same socket is no longer unregistered (and was already reported once).
    expect(recorded).toHaveLength(0);
  });
});

describe('agent sessions against a per-repo baseline', () => {
  const agentLsof = (remote: string, pid = 202) => lsofOutput([{ pid, command: 'node', socks: [sock(remote)] }]);

  it('records the first connection as medium, once, and attributes it to the session', async () => {
    lsof = agentLsof('140.82.112.3:443');
    const { run } = make({ agentSessions: () => [SESSION], resolver: resolver() });
    await run();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      severity: 'medium',
      category: 'network',
      sessionId: 's1',
      repoId: 'repo-1',
      fingerprint: 'network:agent:repo-1:140.82.112.3:443',
    });
    expect(recorded[0]!.remediation.map((a) => a.id)).toEqual(['pause-session', 'kill-process-group', 'mute']);
    await run();
    expect(recorded).toHaveLength(1);
  });

  it('survives a restart: the baseline is on disk', async () => {
    lsof = agentLsof('140.82.112.3:443');
    const deps = { agentSessions: () => [SESSION], resolver: resolver() };
    await make(deps).run();
    recorded = [];
    await make(deps).run();
    expect(recorded).toEqual([]);
  });

  it('treats the same destination as new for another repo, and again after 30 days', async () => {
    lsof = agentLsof('140.82.112.3:443');
    let sessions = [SESSION];
    const { run } = make({ agentSessions: () => sessions, resolver: resolver() });
    await run();
    sessions = [{ ...SESSION, repoId: 'repo-2' }];
    await run();
    expect(recorded).toHaveLength(2);
    sessions = [SESSION];
    clock += 31 * 24 * 60 * 60 * 1000;
    await run();
    expect(recorded).toHaveLength(3);
  });

  it('is medium for a public address nothing names: there is no raw-IP rung', async () => {
    lsof = agentLsof('203.0.113.9:443');
    await make({ agentSessions: () => [SESSION] }).run();
    expect(recorded.at(-1)).toMatchObject({ severity: 'medium' });
    expect(recorded.at(-1)!.detail).not.toMatch(/raw IP/);
  });

  it('is high for an unsigned process', async () => {
    signed = false;
    lsof = agentLsof('140.82.112.3:443');
    await make({ agentSessions: () => [SESSION], resolver: resolver() }).run();
    expect(recorded.at(-1)).toMatchObject({ severity: 'high' });
    expect(recorded.at(-1)!.detail).toMatch(/no valid code signature/);
  });

  it('is high for an address a threat-list name resolves to', async () => {
    lsof = agentLsof('198.51.100.30:443');
    const { run } = make({
      agentSessions: () => [SESSION],
      resolver: resolver({ 'webhook.site': ['198.51.100.30'] }),
    });
    await run();
    expect(recorded[0]).toMatchObject({ severity: 'high' });
    expect(recorded[0]!.detail).toMatch(/request-catcher/);
  });

  it('is high for a tunnel whose apex name resolves to the address (a wildcard entry is looked up as its base)', async () => {
    lsof = agentLsof('198.51.100.20:443');
    await make({ agentSessions: () => [SESSION], resolver: resolver({ 'trycloudflare.com': ['198.51.100.20'] }) }).run();
    expect(recorded[0]).toMatchObject({ severity: 'high' });
    expect(recorded[0]!.detail).toMatch(/tunnel service/);
  });

  it('falls back to the pty root pid when ps is unavailable', async () => {
    psOk = false;
    lsof = agentLsof('140.82.112.3:443', 200);
    const { run } = make({ agentSessions: () => [SESSION], resolver: resolver() });
    await run();
    expect(recorded).toHaveLength(1);
  });

  it('survives the composer failing to list sessions', async () => {
    lsof = agentLsof('140.82.112.3:443');
    const { run } = make({
      agentSessions: () => {
        throw new Error('broker down');
      },
    });
    await expect(run()).resolves.toEqual({ findings: 0 });
  });
});

describe('name lookups', () => {
  it('only ever asks the resolver about the two fixed lists, never an observed destination', async () => {
    lsof = lsofOutput([
      { pid: APP_PID, command: 'Midnite', socks: [sock('203.0.113.7:443')] },
      { pid: 202, command: 'node', socks: [sock('140.82.112.3:443'), sock('198.51.100.77:8443')] },
    ]);
    const { run } = make({ agentSessions: () => [SESSION] });
    await run();
    const fixed = new Set([
      'api.registry.example',
      ...NETWORK_THREAT_HOSTS.map((entry) => entry.pattern.replace(/^\*\./, '')),
    ]);
    expect(lookedUp.length).toBeGreaterThan(0);
    for (const name of lookedUp) expect(fixed.has(name), name).toBe(true);
    expect(lookedUp.some((name) => /^[\d.:]+$/.test(name))).toBe(false);
  });
});

describe('the cadence and the visibility gate', () => {
  it('reads nothing while the window is blurred and no agent runs, but "Run now" still answers', async () => {
    lsof = lsofOutput([{ pid: 300, command: 'ssh', socks: [sock('198.51.100.9:22')] }]);
    const { run, connections } = make({ windowFocused: () => false });
    await run('schedule');
    expect(calls).toEqual([]);
    expect(connections.get().note).toMatch(/not focused/);
    await run('manual');
    expect(calls.some((c) => c.includes('lsof'))).toBe(true);
  });

  it('reads while the window is blurred if an agent session is live, and on every tick', async () => {
    const { sensor } = make({ windowFocused: () => false, agentSessions: () => [SESSION] });
    await sensor.start?.(ctx());
    await sensor.run!(ctx(), 'schedule');
    clock += NETWORK_LIVE_MS;
    await sensor.run!(ctx(), 'schedule');
    expect(calls.filter((c) => c.includes('lsof'))).toHaveLength(2);
  });

  it('runs once a minute with no agent session', async () => {
    const { sensor } = make();
    await sensor.start?.(ctx());
    await sensor.run!(ctx(), 'start');
    for (let tick = 1; tick <= 6; tick += 1) {
      clock += NETWORK_LIVE_MS;
      await sensor.run!(ctx(), 'schedule');
    }
    // The start pass, then one at +60 s: five of the six ticks were not due.
    expect(calls.filter((c) => c.includes('lsof'))).toHaveLength(2);
  });

  it('ticks on the 10 s base rate', () => {
    expect(make().sensor.schedule).toEqual({ kind: 'interval', ms: NETWORK_LIVE_MS });
    expect(NETWORK_IDLE_MS).toBe(6 * NETWORK_LIVE_MS);
  });
});

describe('failure and shape', () => {
  it('throws, with a sentence, when lsof is missing or fails, and leaves a note for the tab', async () => {
    const { run, connections } = make();
    lsofFails = 'not-installed';
    await expect(run()).rejects.toThrow(/lsof is not available/);
    expect(connections.get().note).toMatch(/lsof is not available/);
    lsofFails = 'failed';
    await expect(run()).rejects.toThrow(/lsof failed: boom/);
  });

  it('runs lsof by absolute path with the documented argv, and a deadline', async () => {
    const seen: Array<{ command: string; args: readonly string[]; timeoutMs?: number; signal?: AbortSignal }> = [];
    const { sensor } = make();
    const spying: SensorContext = {
      ...ctx(),
      runProcess: async (command, args, options) => {
        seen.push({ command, args, ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}), ...(options?.signal ? { signal: options.signal } : {}) });
        return { ok: true, stdout: '', stderr: '', exitCode: 1 };
      },
    };
    await sensor.run!(spying, 'manual');
    expect(seen[0]).toMatchObject({ command: '/usr/sbin/lsof', args: ['-i', '-nP', '-F', 'pcnPT'] });
    expect(seen[0]!.timeoutMs).toBeGreaterThan(0);
    expect(seen[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  it('orders the snapshot suite first, then agent sessions, then the rest', async () => {
    lsof = lsofOutput([
      { pid: 300, command: 'ssh', socks: [sock('198.51.100.9:22')] },
      { pid: 202, command: 'node', socks: [sock('140.82.112.3:443')] },
      { pid: APP_PID, command: 'Midnite', socks: [sock('104.16.0.1:443')] },
    ]);
    const { run, connections } = make({
      agentSessions: () => [SESSION],
      resolver: resolver({ 'api.registry.example': ['104.16.0.1'] }),
    });
    await run();
    expect(connections.get().connections.map((c) => c.role)).toEqual(['suite', 'agent', 'other']);
    expect(connections.get().active).toBe(true);
  });

  it('clears the snapshot when it is stopped', async () => {
    lsof = lsofOutput([{ pid: 300, command: 'ssh', socks: [sock('198.51.100.9:22')] }]);
    const { sensor, connections } = make();
    const dispose = await sensor.start?.(ctx());
    await sensor.run!(ctx(), 'manual');
    expect(connections.get().connections).toHaveLength(1);
    if (typeof dispose === 'function') dispose();
    expect(connections.get()).toEqual({ at: null, active: false, connections: [] });
  });
});
