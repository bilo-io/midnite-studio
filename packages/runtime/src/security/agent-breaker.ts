import { randomUUID } from 'node:crypto';

import {
  AGENT_LIMIT_LABELS,
  AGENT_LIMIT_WINDOW_MS,
  type AgentAuditCursor,
  type AgentAuditRecord,
  type AgentLimitKey,
  type AgentLimits,
  type AgentLimitTrip,
  type NewAgentAuditRecord,
  type NewSecurityFinding,
} from '@midnite/studio-shared';

import type { AgentAuditReadResult } from './agent-audit';

/**
 * The circuit breaker — Phase 121 Theme F.
 *
 * A sliding window per session over what Theme G's trail records an agent doing (`mcp-call`s and the
 * command lines typed into its pty). When a count passes its limit the breaker **interrupts the session**,
 * writes a `limit-trip` audit record, raises a `medium` finding and tells the host to show the
 * Resume / Stop / Raise notification. Pure over injected seams — no `electron`, no pty, no feature
 * import — so the composer wires the real ones and a test wires fakes.
 *
 * A limit trips when the count goes **past** its threshold: at 120 calls a minute the 120th is fine and
 * the 121st trips. The session then stays latched (no second trip, no second interrupt) until the user
 * answers: **resume** clears its windows and carries on, **raise** does the same with that one limit
 * doubled for the rest of the session, **stop** ends the session through the host's `stop`.
 *
 * What the trail can see is what is counted. Tool calls are the MCP calls; a "file write" is an MCP call
 * whose tool name says it writes; a push is a `git push` command line (or a push tool); outbound hosts are
 * the hosts named in command lines. An agent's own built-in tools do not pass through the trail, so they
 * are outside these counts by construction.
 */

const WRITE_TOOL = /(^|[._:-])(write|edit|patch|save|create[_-]?file|apply|delete|remove|rename|move)([._:-]|$)/i;
const PUSH_TOOL = /(^|[._:-])push([._:-]|$)/i;
const GIT_PUSH = /(?:^|[\s;&|(])git(?:\s+-\S+(?:\s+\S+)?)*\s+push(?:\s|$)/;
const URL_HOST = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@'"]*@)?([a-z0-9.-]+|\[[0-9a-f:]+\])/gi;
const SCP_HOST = /(?:^|[\s;&|(])(?:ssh|scp|sftp|rsync|nc|ncat|telnet)\s+(?:-\S+\s+)*(?:[\w.-]+@)?([a-z0-9][a-z0-9.-]*\.[a-z]{2,}|\d{1,3}(?:\.\d{1,3}){3})\b/gi;

/** `user@host:path`, the scp/rsync/git remote form, anywhere in the line. */
const AT_HOST = /(?:^|\s)[\w.-]+@([a-z0-9][a-z0-9.-]*\.[a-z]{2,}):/gi;

/** The hosts a command line reaches out to, lowercased and de-duplicated. */
export function outboundHosts(command: string): string[] {
  const hosts = new Set<string>();
  for (const match of command.matchAll(URL_HOST)) if (match[1]) hosts.add(match[1].toLowerCase());
  for (const match of command.matchAll(SCP_HOST)) if (match[1]) hosts.add(match[1].toLowerCase());
  for (const match of command.matchAll(AT_HOST)) if (match[1]) hosts.add(match[1].toLowerCase());
  return [...hosts].filter((host) => !isLocalHost(host));
}

/** Loopback and private-range addresses are not "outbound". */
function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '[::1]' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

export type BreakerAnswer = 'resume' | 'stop' | 'raise';

export interface AgentBreakerOptions {
  /**
   * The trail's read side. A watcher starts at the end of the trail (a `null` cursor), so history from before
   * the app started never trips anything.
   */
  reader: { readSince(cursor: AgentAuditCursor | null): Promise<AgentAuditReadResult> };
  /** The limits for one session (the composer resolves them against the session's repo). */
  limits(sessionId: string): AgentLimits | Promise<AgentLimits>;
  /**
   * Interrupt the session (Ctrl+C to its pty). `false` when it is not live. This is the seam Phase 120 G's
   * pause path reuses: it is the same pty write Vanguard's `pause-session` response action performs.
   */
  interrupt(sessionId: string): Promise<boolean>;
  /** End the session; the "Stop" answer. */
  stop?(sessionId: string): Promise<boolean>;
  /** Append a `limit-trip` record to the trail. */
  record(record: NewAgentAuditRecord): void;
  /** Raise the finding in the findings ledger. */
  raiseFinding(finding: NewSecurityFinding): Promise<unknown>;
  /** Show the notification. */
  notify(trip: AgentLimitTrip): void;
  /** Tokens the session has spent so far; `null` when unknown. Read on `poll`, not per record. */
  spend?(sessionId: string): Promise<number | null>;
  /** Called when something unexpected fails; the breaker never throws. */
  onError?(error: unknown): void;
  /** How long an unanswered trip holds the session before the breaker re-arms by itself. Default 10 min. */
  latchMs?: number;
  /** Minimum gap between spend readings. Default 30 s. */
  spendEveryMs?: number;
  now?(): number;
}

interface SessionState {
  calls: number[];
  writes: number[];
  pushes: number[];
  hosts: Set<string>;
  /** Spend already counted before the last resume; the spend limit measures from here. */
  spendBase: number;
  /** Limits the user raised for this session. */
  raised: Partial<Record<AgentLimitKey, number>>;
  /** The open trip, while the session waits for an answer. */
  open: AgentLimitTrip | null;
  /** The user chose Stop: nothing more trips. */
  stopped: boolean;
}

export interface AgentBreaker {
  /** Feed one trail record through the windows. Resolves once any trip it caused has been handled. */
  observe(record: AgentAuditRecord): Promise<void>;
  /** Read what the trail gained since the last poll, feed it in, then check spend for live sessions. */
  poll(): Promise<void>;
  /** The user's answer to a trip. `false` when the trip is unknown or already answered. */
  resolve(tripId: string, answer: BreakerAnswer): Promise<boolean>;
  /** Forget a session that ended. */
  forget(sessionId: string): void;
  /** Poll on a timer until the returned function is called. */
  start(intervalMs: number): () => void;
}

export function createAgentBreaker(options: AgentBreakerOptions): AgentBreaker {
  const now = options.now ?? Date.now;
  const states = new Map<string, SessionState>();
  const trips = new Map<string, string>();
  let cursor: AgentAuditCursor | null = null;
  let primed = false;
  let chain: Promise<unknown> = Promise.resolve();
  let lastSpendAt = Number.NEGATIVE_INFINITY;
  const latchMs = options.latchMs ?? 600_000;
  const spendEveryMs = options.spendEveryMs ?? 30_000;

  const stateFor = (sessionId: string): SessionState => {
    let state = states.get(sessionId);
    if (!state) {
      state = { calls: [], writes: [], pushes: [], hosts: new Set(), spendBase: 0, raised: {}, open: null, stopped: false };
      states.set(sessionId, state);
    }
    return state;
  };

  const slide = (list: number[], at: number, windowMs: number): void => {
    const floor = at - windowMs;
    let drop = 0;
    while (drop < list.length && (list[drop] as number) <= floor) drop += 1;
    if (drop > 0) list.splice(0, drop);
  };

  const threshold = (limits: AgentLimits, state: SessionState, key: AgentLimitKey): number | null => {
    const base = limits[key];
    if (base === null) return null;
    return state.raised[key] ?? base;
  };

  const trip = async (sessionId: string, state: SessionState, key: AgentLimitKey, observed: number, limit: number, at: number): Promise<void> => {
    const windowMs = key in AGENT_LIMIT_WINDOW_MS ? AGENT_LIMIT_WINDOW_MS[key as keyof typeof AGENT_LIMIT_WINDOW_MS] : undefined;
    const message = `Agent session paused: ${observed} ${AGENT_LIMIT_LABELS[key]} (limit ${limit}).`;
    const tripRow: AgentLimitTrip = { id: randomUUID(), sessionId, limit: key, observed, threshold: limit, message, at };
    state.open = tripRow;
    trips.set(tripRow.id, sessionId);
    // Interrupt first: everything after it is bookkeeping and must not delay the stop.
    let interrupted = false;
    try {
      interrupted = await options.interrupt(sessionId);
    } catch (error) {
      options.onError?.(error);
    }
    try {
      options.record({ kind: 'limit-trip', sessionId, at, limit: key, observed, threshold: limit, ...(windowMs ? { windowMs } : {}) });
    } catch (error) {
      options.onError?.(error);
    }
    try {
      await options.raiseFinding({
        source: 'agents',
        severity: 'medium',
        category: 'agent',
        // One open finding per session and limit: a second trip after a resume counts up the same row.
        fingerprint: `agents:limit-trip:${sessionId}:${key}`,
        title: `Agent hit its ${AGENT_LIMIT_LABELS[key]} limit`,
        detail: `${message} ${interrupted ? 'The session was interrupted with Ctrl+C.' : 'The session could not be reached to interrupt it.'} Resume, stop or raise the limit from the notification.`,
        evidence: [],
        remediation: [{ id: 'pause-session', sessionId, description: 'Interrupt the session again' }],
        sessionId,
      });
    } catch (error) {
      options.onError?.(error);
    }
    try {
      options.notify(tripRow);
    } catch (error) {
      options.onError?.(error);
    }
  };

  const check = async (sessionId: string, state: SessionState, key: AgentLimitKey, observed: number, at: number): Promise<void> => {
    if (state.open && at - state.open.at > latchMs) {
      // Nobody answered (the notice was lost to a reload, or ignored): re-arm rather than leave the session unwatched.
      trips.delete(state.open.id);
      state.open = null;
      state.calls.length = state.writes.length = state.pushes.length = 0;
      state.hosts.clear();
    }
    if (state.open || state.stopped) return;
    const limits = await options.limits(sessionId);
    const limit = threshold(limits, state, key);
    if (limit !== null && observed > limit) await trip(sessionId, state, key, observed, limit, at);
  };

  const handle = async (record: AgentAuditRecord): Promise<void> => {
    const sessionId = record.sessionId;
    if (!sessionId) return;
    const state = stateFor(sessionId);
    if (state.stopped) return;
    const at = record.at;
    if (record.kind === 'mcp-call') {
      state.calls.push(at);
      slide(state.calls, at, AGENT_LIMIT_WINDOW_MS.toolCallsPerMinute);
      await check(sessionId, state, 'toolCallsPerMinute', state.calls.length, at);
      if (WRITE_TOOL.test(record.tool)) {
        state.writes.push(at);
        slide(state.writes, at, AGENT_LIMIT_WINDOW_MS.fileWritesPerMinute);
        await check(sessionId, state, 'fileWritesPerMinute', state.writes.length, at);
      }
      if (PUSH_TOOL.test(record.tool)) await push(sessionId, state, at);
    } else if (record.kind === 'command') {
      if (GIT_PUSH.test(record.command)) await push(sessionId, state, at);
      const before = state.hosts.size;
      for (const host of outboundHosts(record.command)) state.hosts.add(host);
      if (state.hosts.size !== before) await check(sessionId, state, 'outboundHostsPerSession', state.hosts.size, at);
    }
  };

  const push = async (sessionId: string, state: SessionState, at: number): Promise<void> => {
    state.pushes.push(at);
    slide(state.pushes, at, AGENT_LIMIT_WINDOW_MS.gitPushesPerHour);
    await check(sessionId, state, 'gitPushesPerHour', state.pushes.length, at);
  };

  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = chain.then(work, work);
    chain = run.catch(() => undefined);
    return run;
  };

  const breaker: AgentBreaker = {
    observe: (record) => serial(() => handle(record)).catch((error) => options.onError?.(error)),

    poll: () =>
      serial(async () => {
        const result = await options.reader.readSince(primed ? cursor : null);
        // Only a real cursor primes: a trail that is not open yet must not make the first real read skip history.
        if (result.cursor !== null) primed = true;
        cursor = result.cursor;
        for (const record of result.records) {
          try {
            await handle(record);
          } catch (error) {
            options.onError?.(error);
          }
        }
        if (!options.spend || now() - lastSpendAt < spendEveryMs) return;
        lastSpendAt = now();
        for (const [sessionId, state] of states) {
          if (state.open && now() - state.open.at <= latchMs) continue;
          if (state.stopped) continue;
          const spent = await options.spend(sessionId);
          if (spent !== null) await check(sessionId, state, 'spendTokensPerSession', spent - state.spendBase, now());
        }
      }).catch((error) => options.onError?.(error)),

    resolve: (tripId, answer) =>
      serial(async () => {
        const sessionId = trips.get(tripId);
        const state = sessionId === undefined ? undefined : states.get(sessionId);
        const open = state?.open;
        if (!sessionId || !state || !open || open.id !== tripId) return false;
        trips.delete(tripId);
        if (answer === 'stop') {
          state.stopped = true;
          state.open = null;
          await options.stop?.(sessionId);
          return true;
        }
        if (answer === 'raise') state.raised[open.limit] = Math.max(open.threshold, open.observed) * 2;
        // Resume: the window starts empty, and a spend limit measures from where the session stands now.
        state.calls.length = 0;
        state.writes.length = 0;
        state.pushes.length = 0;
        state.hosts.clear();
        if (open.limit === 'spendTokensPerSession') state.spendBase += open.observed;
        state.open = null;
        return true;
      }).catch((error) => {
        options.onError?.(error);
        return false;
      }),

    forget: (sessionId) => {
      const state = states.get(sessionId);
      if (state?.open) trips.delete(state.open.id);
      states.delete(sessionId);
    },

    start: (intervalMs) => {
      const timer = setInterval(() => void breaker.poll(), intervalMs);
      timer.unref?.();
      return () => clearInterval(timer);
    },
  };
  return breaker;
}
