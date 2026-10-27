import {
  EGRESS_HOSTS,
  NETWORK_THREAT_HOSTS,
  NETWORK_UNREGISTERED_SUITE_SEVERITY,
  type EgressHost,
  type EvidenceItem,
  type NetworkConnection,
  type NetworkThreatHost,
  type NewSecurityFinding,
  type RemediationAction,
  type VanguardConnectionsResponse,
} from '@midnite/studio-shared';

import {
  loadNetworkBaseline,
  observeDestination,
  pruneBaseline,
  saveNetworkBaseline,
  type NetworkBaseline,
} from './network/baseline';
import { classifyAgentDestination } from './network/classify';
import { destinationKey, isLocalOnly, unmapIpv4 } from './network/hosts';
import { LSOF_ARGS, parseLsof, type LsofConnection } from './network/lsof';
import { parsePs, PS_ARGS, subtreeOf, type PsRow } from './network/processes';
import { createDnsResolver, type NetworkResolver } from './network/resolver';
import type { SensorContext, SensorDefinition, SensorRunResult } from './sensor-host';

/**
 * The network sensor (Phase 120 Theme E): `lsof` snapshots of outbound connections, read two ways.
 *
 * - **The suite's own processes against Phase 115 A's registry.** A connection from the app or its broker to
 *   an address that none of `EGRESS_HOSTS` resolves to is a `network` finding at
 *   `NETWORK_UNREGISTERED_SUITE_SEVERITY` (`info` until the registry covers the app's real egress): the leak
 *   the registry test cannot see, because that test covers `fetch` and not a native module. Electron's helper
 *   processes are not "the suite" here: Chromium's network service carries the embedded browser, and a
 *   page may reach anywhere.
 * - **Agent sessions against a per-repo baseline.** The first connection from a process under an agent
 *   session to each `(address, port)` is recorded; one the repo has not seen in 30 days is `medium`, and
 *   `high` when the process is unsigned or the address is one a threat-list name resolves to.
 *
 * Cadence and gate (the phase doc's, Phase 76's): every 10 s while an agent session is live, every 60 s
 * otherwise, and nothing at all while the window is blurred and no agent runs. The host's timer ticks at
 * the fast rate and the gate in `run` drops the passes that are not due; "Run now" and the first pass
 * after start are never gated. This sensor ignores `settings().cadenceSeconds`: the doc fixes the rate.
 *
 * `lsof -n` prints addresses, so the resolver turns the app's own fixed name lists (`EGRESS_HOSTS` and
 * `NETWORK_THREAT_HOSTS`) into addresses with forward lookups through the system resolver. Nothing observed
 * is ever sent to it: there are no reverse lookups. No `electron` here: everything is injected.
 */

export const NETWORK_SENSOR_ID = 'network';
export const NETWORK_LIVE_MS = 10_000;
export const NETWORK_IDLE_MS = 60_000;
/** The timer fires every 10 s, so an idle pass is due a little before 60 s has strictly passed. */
const IDLE_SLACK_MS = 500;
const LSOF = '/usr/sbin/lsof';
const PS = '/bin/ps';
const CODESIGN = '/usr/bin/codesign';
const LSOF_TIMEOUT_MS = 8_000;
const REGISTRY_REFRESH_MS = 10 * 60_000;
const MAX_ROWS = 400;
const EVIDENCE_ARGV = 6;

/** A pty session running an agent, as the composer lists it. */
export interface NetworkAgentSession {
  sessionId: string;
  repoId: string;
  /** The pty's root process; everything below it is the session's. */
  pid: number;
  title?: string;
}

/** Who the suite's own processes are. */
export interface NetworkSuiteIdentity {
  /** The app's main process (`process.pid`). */
  pid: number;
  /** A process whose `ps` arguments hold one of these is the suite's broker (its script path). */
  brokerMarkers?: readonly string[];
}

/** The last snapshot the Network tab reads. */
export interface ConnectionStore {
  get(): VanguardConnectionsResponse;
  set(next: VanguardConnectionsResponse): void;
}

export function createConnectionStore(): ConnectionStore {
  let current: VanguardConnectionsResponse = { at: null, active: false, connections: [] };
  return { get: () => current, set: (next) => void (current = next) };
}

export interface NetworkSensorDeps {
  /** Where the snapshot goes; the service shares it with the connections handler. */
  connections: ConnectionStore;
  /** The suite's own processes. Absent: nothing is held to the registry (the sensor still watches agents). */
  suite?: NetworkSuiteIdentity;
  /** The agent sessions live now. Absent or empty: the idle rate and the blur gate apply. */
  agentSessions?(): readonly NetworkAgentSession[] | Promise<readonly NetworkAgentSession[]>;
  /** The window is focused. Absent: treated as focused (an app with no window to gate on). */
  windowFocused?(): boolean;
  resolver?: NetworkResolver;
  /** Phase 115 A's registry; defaults to `EGRESS_HOSTS`. */
  registry?: Record<string, EgressHost>;
}

const clip = (text: string, max = 200): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

interface Classified {
  conn: LsofConnection;
  remote: { host: string; port: number };
  role: NetworkConnection['role'];
  label?: string;
  session?: NetworkAgentSession;
  row?: PsRow;
}

export function createNetworkSensor(deps: NetworkSensorDeps): SensorDefinition {
  const resolver = deps.resolver ?? createDnsResolver();
  const registry = deps.registry ?? EGRESS_HOSTS;

  let baseline: NetworkBaseline | null = null;
  let lastScanAt = 0;
  /** Registry host to every address it has answered on, accumulated: a CDN rotates what it hands out. */
  const registryAddresses = new Map<string, Set<string>>();
  let registryAt = 0;
  /** Threat-list names to their addresses, same idea. */
  const threatAddresses = new Map<string, { entry: NetworkThreatHost; addresses: Set<string> }>();
  let threatAt = 0;
  const unsignedByPath = new Map<string, boolean | null>();
  /** Rows flagged earlier, so the Network tab keeps marking a destination after the finding is raised. */
  const flags = new Map<string, NonNullable<NetworkConnection['flagged']>>();
  /** Suite sockets already reported while still open. */
  let suiteSeen = new Set<string>();

  async function refreshRegistry(now: number): Promise<void> {
    if (registryAt !== 0 && now - registryAt < REGISTRY_REFRESH_MS) return;
    registryAt = now;
    await Promise.all(
      Object.keys(registry).map(async (host) => {
        const found = registryAddresses.get(host) ?? new Set<string>();
        for (const address of await resolver.lookup(host)) found.add(address);
        registryAddresses.set(host, found);
      }),
    );
    // A host that did not resolve (offline, a slow resolver) would make every connection to it look
    // unregistered, so ask again in a minute rather than trusting the gap for ten.
    if ([...registryAddresses.values()].some((found) => found.size === 0)) {
      registryAt = now - REGISTRY_REFRESH_MS + 60_000;
    }
  }

  async function refreshThreats(now: number): Promise<void> {
    if (threatAt !== 0 && now - threatAt < REGISTRY_REFRESH_MS * 6) return;
    threatAt = now;
    await Promise.all(
      NETWORK_THREAT_HOSTS.map(async (entry) => {
        const name = entry.pattern.replace(/^\*\./, '');
        const slot = threatAddresses.get(name) ?? { entry, addresses: new Set<string>() };
        for (const address of await resolver.lookup(name)) slot.addresses.add(address);
        threatAddresses.set(name, slot);
      }),
    );
    if (![...threatAddresses.values()].some((slot) => slot.addresses.size > 0)) {
      threatAt = now - REGISTRY_REFRESH_MS * 6 + 60_000;
    }
  }

  function allowedBy(address: string): string | undefined {
    for (const [host, addresses] of registryAddresses) if (addresses.has(address)) return host;
    return undefined;
  }

  function threatFor(address: string): NetworkThreatHost | undefined {
    for (const { entry, addresses } of threatAddresses.values()) if (addresses.has(address)) return entry;
    return undefined;
  }

  /** The executable behind a pid has no valid signature. `null`: could not tell. Cached per path. */
  async function isUnsigned(ctx: SensorContext, pid: number): Promise<boolean | null> {
    const comm = await ctx.runProcess(PS, ['-o', 'comm=', '-p', String(pid)], { timeoutMs: 3000, signal: ctx.signal });
    const path = comm.ok ? comm.stdout.trim() : '';
    if (path === '') return null;
    if (unsignedByPath.has(path)) return unsignedByPath.get(path) ?? null;
    const result = await ctx.runProcess(CODESIGN, ['--verify', '--strict', path], { timeoutMs: 10_000, signal: ctx.signal });
    const verdict = result.ok ? result.exitCode !== 0 : null;
    unsignedByPath.set(path, verdict);
    return verdict;
  }

  const evidenceFor = (item: Classified, row: PsRow | undefined): EvidenceItem[] => {
    const argv = row ? row.args.split(/\s+/).slice(1, EVIDENCE_ARGV + 1).map((arg) => clip(arg)) : [];
    return [
      {
        kind: 'pid',
        pid: item.conn.pid,
        command: item.conn.command,
        ...(row ? { ppid: row.ppid } : {}),
        ...(argv.length > 0 ? { args: argv } : {}),
      },
      {
        kind: 'host',
        host: item.remote.host,
        port: item.remote.port,
        protocol: item.conn.protocol.toLowerCase(),
      },
    ];
  };

  async function scan(ctx: SensorContext, now: number, agents: readonly NetworkAgentSession[]): Promise<number> {
    const lsof = await ctx.runProcess(LSOF, LSOF_ARGS, { timeoutMs: LSOF_TIMEOUT_MS, signal: ctx.signal });
    if (!lsof.ok) throw new Error(lsof.reason === 'not-installed' ? 'lsof is not available on this machine' : `lsof failed: ${lsof.hint}`);

    const outbound: Array<{ conn: LsofConnection; remote: { host: string; port: number } }> = [];
    const seenRows = new Set<string>();
    for (const conn of parseLsof(lsof.stdout)) {
      if (conn.remote === null || isLocalOnly(conn.remote.host)) continue;
      const remote = { host: unmapIpv4(conn.remote.host.toLowerCase()), port: conn.remote.port };
      const id = `${conn.pid}|${conn.protocol}|${remote.host}:${remote.port}`;
      if (seenRows.has(id)) continue;
      seenRows.add(id);
      outbound.push({ conn, remote });
    }

    let rows: PsRow[] = [];
    if (outbound.length > 0) {
      const ps = await ctx.runProcess(PS, PS_ARGS, { timeoutMs: LSOF_TIMEOUT_MS, signal: ctx.signal });
      if (ps.ok) rows = parsePs(ps.stdout);
      else ctx.log('warn', `ps failed, agent processes are matched by their root pid alone: ${ps.hint}`);
    }
    const rowOf = new Map(rows.map((row) => [row.pid, row]));
    const sessionOf = new Map<number, NetworkAgentSession>();
    for (const session of agents) {
      for (const pid of subtreeOf(rows, session.pid)) if (!sessionOf.has(pid)) sessionOf.set(pid, session);
    }
    const markers = deps.suite?.brokerMarkers ?? [];

    const classified: Classified[] = outbound.map(({ conn, remote }) => {
      const row = rowOf.get(conn.pid);
      const session = sessionOf.get(conn.pid);
      if (session) return { conn, remote, role: 'agent', session, ...(row ? { row } : {}) };
      if (deps.suite && conn.pid === deps.suite.pid) return { conn, remote, role: 'suite', label: 'app', ...(row ? { row } : {}) };
      if (row && markers.some((marker) => marker !== '' && row.args.includes(marker))) {
        return { conn, remote, role: 'suite', label: 'broker', row };
      }
      return { conn, remote, role: 'other', ...(row ? { row } : {}) };
    });

    if (classified.some((c) => c.role === 'suite')) await refreshRegistry(now);

    let findings = 0;
    const out: NetworkConnection[] = [];
    const handledAgent = new Set<string>();
    const suiteNow = new Set<string>();
    let baselineDirty = false;
    baseline ??= await loadNetworkBaseline(ctx.userData);

    for (const item of classified) {
      const { conn, remote } = item;
      const view: NetworkConnection = {
        pid: conn.pid,
        command: conn.command,
        role: item.role,
        ...(item.label ? { label: item.label } : {}),
        protocol: conn.protocol,
        ...(conn.state ? { state: conn.state } : {}),
        remoteHost: remote.host,
        remotePort: remote.port,
        ...(item.session ? { sessionId: item.session.sessionId, repoId: item.session.repoId } : {}),
      };

      if (item.role === 'suite') {
        const allowed = allowedBy(remote.host);
        if (allowed !== undefined) {
          view.allowedBy = allowed;
        } else {
          const label = item.label ?? 'app';
          const reason = `The ${label} connected to a host the egress registry does not list.`;
          view.flagged = { severity: NETWORK_UNREGISTERED_SUITE_SEVERITY, reason };
          // One record per socket, not per scan: the same open connection seen again is not a new event.
          const socket = `${conn.pid}|${label}|${destinationKey(remote.host, remote.port)}`;
          suiteNow.add(socket);
          if (!suiteSeen.has(socket)) {
            findings += 1;
            await ctx.record(suiteFinding(item, label, evidenceFor(item, item.row)));
          }
        }
      } else if (item.role === 'agent' && item.session) {
        const repoId = item.session.repoId;
        const key = destinationKey(remote.host, remote.port);
        const handled = `${repoId}|${key}`;
        if (!handledAgent.has(handled)) {
          handledAgent.add(handled);
          if (observeDestination(baseline, repoId, key, now) === 'new') {
            baselineDirty = true;
            await refreshThreats(now);
            const unsigned = (await isUnsigned(ctx, conn.pid)) === true;
            const threat = threatFor(remote.host);
            const verdict = classifyAgentDestination({
              unsigned,
              ...(threat ? { threat } : {}),
            });
            const reason = verdict.reasons[0] ?? 'A destination this repo has not reached in 30 days.';
            flags.set(`agent|${repoId}|${key}`, { severity: verdict.severity, reason });
            findings += 1;
            await ctx.record(
              agentFinding(item, item.session, verdict, evidenceFor(item, item.row)),
            );
          }
        }
        const flagged = flags.get(`agent|${repoId}|${key}`);
        if (flagged) view.flagged = flagged;
      }
      out.push(view);
    }

    suiteSeen = suiteNow;
    if (baselineDirty) {
      pruneBaseline(baseline, now);
      await saveNetworkBaseline(ctx.userData, baseline).catch((error: unknown) =>
        ctx.log('warn', `could not save the network baseline: ${error instanceof Error ? error.message : String(error)}`),
      );
    }

    const rank = { suite: 0, agent: 1, other: 2 } as const;
    out.sort((a, b) => rank[a.role] - rank[b.role] || a.command.localeCompare(b.command) || a.pid - b.pid);
    deps.connections.set({ at: now, active: true, connections: out.slice(0, MAX_ROWS) });
    return findings;
  }

  const definition: SensorDefinition = {
    id: NETWORK_SENSOR_ID,
    label: 'Network',
    description:
      'Outbound connections per process (lsof): the suite’s own against the egress registry, agent sessions against a per-repo baseline. Every 10 s while an agent runs, every 60 s otherwise, nothing while the window is blurred.',
    schedule: { kind: 'interval', ms: NETWORK_LIVE_MS },
    start: () => {
      baseline = null;
      lastScanAt = 0;
      return () => {
        baseline = null;
        suiteSeen = new Set();
        deps.connections.set({ at: null, active: false, connections: [] });
      };
    },
    async run(ctx, trigger = 'schedule'): Promise<SensorRunResult> {
      const now = ctx.now();
      const agents = await (async () => deps.agentSessions?.())().then(
        (list) => list ?? [],
        () => [] as readonly NetworkAgentSession[],
      );
      if (trigger === 'schedule' && agents.length === 0) {
        if (deps.windowFocused && !deps.windowFocused()) {
          const held = deps.connections.get();
          deps.connections.set({
            ...held,
            note: 'Paused: the window is not focused and no agent session is running.',
          });
          return { findings: 0 };
        }
        if (lastScanAt !== 0 && now - lastScanAt < NETWORK_IDLE_MS - IDLE_SLACK_MS) return { findings: 0 };
      }
      lastScanAt = now;
      try {
        return { findings: await scan(ctx, now, agents) };
      } catch (error) {
        const held = deps.connections.get();
        deps.connections.set({ ...held, note: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
  };
  return definition;
}

function suiteFinding(
  item: Classified,
  label: string,
  evidence: EvidenceItem[],
): Omit<NewSecurityFinding, 'source'> {
  const target = `${item.remote.host}:${item.remote.port}`;
  return {
    fingerprint: `network:suite:${label}:${destinationKey(item.remote.host, item.remote.port)}`,
    severity: NETWORK_UNREGISTERED_SUITE_SEVERITY,
    category: 'network',
    title: `${label === 'broker' ? 'The terminal broker' : 'Midnite'} connected to ${target}, which the egress registry does not list`,
    detail:
      `${item.conn.command} (pid ${item.conn.pid}) holds an open ${item.conn.protocol} connection to ${item.remote.host}:${item.remote.port}. ` +
      'Every host the suite talks to is meant to be listed in the egress registry; this one is not. ' +
      'The registry test covers `fetch`, not a native module, so this is a leak it cannot see. ' +
      'This is rated info for now: the registry does not yet cover the app’s forge, database and LLM calls, so most ' +
      'hits are an ordinary call the registry has yet to list (add it there and mute this).',
    evidence,
    remediation: [
      { id: 'report-issue', title: `Unregistered egress to ${target}`, description: 'Open an issue naming the host and the process.' },
      { id: 'mute', description: 'Mute this destination.' },
    ],
  };
}

function agentFinding(
  item: Classified,
  session: NetworkAgentSession,
  verdict: ReturnType<typeof classifyAgentDestination>,
  evidence: EvidenceItem[],
): Omit<NewSecurityFinding, 'source'> {
  const target = `${item.remote.host}:${item.remote.port}`;
  const remediation: RemediationAction[] = [
    { id: 'pause-session', sessionId: session.sessionId, description: 'Interrupt the agent session.' },
    { id: 'kill-process-group', pid: item.conn.pid, description: 'Stop the process that connected.' },
    { id: 'mute', description: 'Mute this destination.' },
  ];
  return {
    fingerprint: `network:agent:${session.repoId}:${destinationKey(item.remote.host, item.remote.port)}`,
    severity: verdict.severity,
    category: 'network',
    title: `An agent session reached a new destination: ${target}`,
    detail:
      `${item.conn.command} (pid ${item.conn.pid}), running under the agent session "${session.title ?? session.sessionId}", connected to ` +
      `${item.remote.host}:${item.remote.port}, a destination this repo has not reached in the last 30 days.` +
      (verdict.reasons.length > 0 ? `\n\n${verdict.reasons.join('\n')}` : '') +
      '\n\nThe connection is attributed by process ancestry and may belong to a tool the agent ran for a good reason.',
    evidence,
    remediation,
    sessionId: session.sessionId,
    repoId: session.repoId,
  };
}
