import { spawn, type ChildProcess } from 'node:child_process';

import type { NewAgentAuditRecord } from '@midnite/studio-shared';

import { readProcessTable } from './confine';

/**
 * What a confined session was refused — Phase 121 Theme E.
 *
 * `log stream --predicate 'sender == "Sandbox"'` reports every Seatbelt denial on the machine as
 * `Sandbox: <process>(<pid>) deny(1) <operation> <target>`. The watcher keeps one such stream open
 * while any confined session lives, keeps the lines whose pid is in a registered session's process
 * tree, writes each as a `confine-denial` audit record (Theme G's trail; Phase 120 G's rogue rules
 * read the kind) and, once a session has been refused `threshold` times inside `windowMs`, raises one
 * finding for it. Everything outside the stream (the audit, the finding, the process table, the
 * clock) is injected, so the logic runs under bare vitest.
 */

export interface SandboxDenial {
  process: string;
  pid: number;
  operation: string;
  target: string;
}

const DENY_LINE = /Sandbox: (.+?)\((\d+)\) deny\(\d+\) (\S+)(?: (.*))?$/;

/** Parse one `log stream` line; `null` for anything that is not a fresh denial. */
export function parseSandboxDenial(line: string): SandboxDenial | null {
  // "1 duplicate report for Sandbox: …" restates a denial already seen.
  if (line.includes('duplicate report')) return null;
  const match = DENY_LINE.exec(line.trimEnd());
  if (!match) return null;
  return { process: match[1] as string, pid: Number(match[2]), operation: match[3] as string, target: (match[4] ?? '').trim() };
}

export interface DenialFinding {
  sessionId: string;
  count: number;
  windowMs: number;
  /** The most recent denial, as an example. */
  sample: SandboxDenial;
}

export interface DenialWatcherOptions {
  audit: { record(input: NewAgentAuditRecord): string };
  /** Raise a finding for a session past the threshold (the Vanguard ledger, wired by the host). */
  raiseFinding?: (finding: DenialFinding) => void;
  /** Denials of one session inside `windowMs` before a finding is raised. Default 5. */
  threshold?: number;
  windowMs?: number;
  now?: () => number;
  /** Open the stream; the real one is `log stream`. Returns a handle and feeds lines to `onLine`. */
  openStream?: (onLine: (line: string) => void) => { stop(): void };
  processTable?: () => Promise<Map<number, number>>;
  onError?: (error: unknown) => void;
}

export interface DenialWatcher {
  /** Attribute denials from `pid` (and its descendants) to `sessionId`. Starts the stream if needed. */
  track(sessionId: string, pid: number): void;
  /** Stop attributing; the stream closes when no session is left. */
  untrack(sessionId: string): void;
  /** Feed one line, for tests and for the real stream. Resolves when it is handled. */
  handleLine(line: string): Promise<void>;
  /** Close the stream and forget every session. */
  stop(): void;
}

export function openLogStream(onLine: (line: string) => void): { stop(): void } {
  const child: ChildProcess = spawn('/usr/bin/log', ['stream', '--style', 'compact', '--predicate', 'sender == "Sandbox"'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let buffer = '';
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk;
    let index: number;
    while ((index = buffer.indexOf('\n')) >= 0) {
      onLine(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
  });
  child.on('error', () => undefined);
  return { stop: () => child.kill('SIGTERM') };
}

export function createDenialWatcher(options: DenialWatcherOptions): DenialWatcher {
  const threshold = options.threshold ?? 5;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  const openStream = options.openStream ?? openLogStream;
  const processTable = options.processTable ?? readProcessTable;
  const roots = new Map<string, number>(); // sessionId -> root pid
  const stamps = new Map<string, number[]>();
  const raised = new Set<string>();
  let stream: { stop(): void } | null = null;

  function sessionFor(pid: number, table: Map<number, number>): string | null {
    for (const [sessionId, root] of roots) {
      let current: number | undefined = pid;
      for (let hops = 0; current !== undefined && current > 1 && hops < 64; hops++) {
        if (current === root) return sessionId;
        current = table.get(current);
      }
    }
    return null;
  }

  async function handleLine(line: string): Promise<void> {
    if (roots.size === 0) return;
    const denial = parseSandboxDenial(line);
    if (!denial) return;
    try {
      let sessionId = sessionFor(denial.pid, new Map());
      if (sessionId === null) sessionId = sessionFor(denial.pid, await processTable());
      if (sessionId === null) return;
      options.audit.record({ kind: 'confine-denial', sessionId, operation: denial.operation, target: denial.target });
      const at = now();
      const recent = (stamps.get(sessionId) ?? []).filter((t) => at - t < windowMs);
      recent.push(at);
      stamps.set(sessionId, recent);
      if (recent.length >= threshold && !raised.has(sessionId)) {
        raised.add(sessionId);
        options.raiseFinding?.({ sessionId, count: recent.length, windowMs, sample: denial });
      }
    } catch (error) {
      options.onError?.(error);
    }
  }

  return {
    track(sessionId, pid) {
      roots.set(sessionId, pid);
      stream ??= openStream((line) => void handleLine(line));
    },
    untrack(sessionId) {
      roots.delete(sessionId);
      stamps.delete(sessionId);
      raised.delete(sessionId);
      if (roots.size === 0 && stream) {
        stream.stop();
        stream = null;
      }
    },
    handleLine,
    stop() {
      roots.clear();
      stamps.clear();
      raised.clear();
      stream?.stop();
      stream = null;
    },
  };
}
