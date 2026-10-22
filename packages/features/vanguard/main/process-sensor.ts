import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { EvidenceItem, RemediationAction } from '@midnite/studio-shared';

import { inspectExecutable } from './code-signing';
import {
  classifyProcess,
  isShellComm,
  newExecutables,
  parsePsTable,
  PS_ARGS,
  underAgentSession,
  type ProcessRow,
} from './process-parse';
import type { SensorDefinition } from './sensor-host';

/**
 * Process-table sensor (Phase 120 Theme D). Each pass reads `ps`, finds executable paths not seen before,
 * and checks each with `codesign`, `spctl` and the quarantine xattr. The known set persists, so a restart
 * does not re-flag everything running; the first ever pass seeds it silently.
 */

export const PROCESS_SENSOR_ID = 'processes';
const KNOWN_FILE = 'baselines/processes.json';
const KNOWN_CAP = 5_000;
/** At most this many new executables are inspected per pass (three shell-outs each); the rest wait. */
const INSPECT_CAP = 12;

export interface ProcessSensorDeps {
  /**
   * Pids of the shells that agent ptys run (the session roots). Injected by the composer from the
   * sessions broker; absent means "no session attribution", and `critical` is then unreachable.
   */
  agentSessions?: () => ReadonlyMap<number, string> | Promise<ReadonlyMap<number, string>>;
  /** Persistence seam for the known set; defaults to a JSON file under `<userData>/vanguard/`. */
  load?: (file: string) => Promise<string[] | null>;
  save?: (file: string, paths: string[]) => Promise<void>;
}

const defaultLoad = async (file: string): Promise<string[] | null> => {
  try {
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : null;
  } catch {
    return null;
  }
};
const defaultSave = async (file: string, paths: string[]): Promise<void> => {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(paths), { mode: 0o600 });
  await rename(tmp, file);
};

export function createProcessSensor(deps: ProcessSensorDeps = {}): SensorDefinition {
  const load = deps.load ?? defaultLoad;
  const save = deps.save ?? defaultSave;
  let known: Set<string> | null = null;
  return {
    id: PROCESS_SENSOR_ID,
    label: 'Processes',
    description:
      'Diffs the process table for new executables and checks each one: code signature, Gatekeeper, quarantine flag.',
    schedule: { kind: 'cadence' },
    start() {
      known = null;
    },
    async run(ctx) {
      const home = ctx.homeDir ?? '';
      const ps = await ctx.runProcess('ps', PS_ARGS, { timeoutMs: 5_000, signal: ctx.signal });
      if (!ps.ok) throw new Error(`ps failed: ${ps.hint}`);
      const table = parsePsTable(ps.stdout);
      const file = join(ctx.userData, 'vanguard', KNOWN_FILE);
      const seeded = known !== null;
      known ??= new Set((await load(file)) ?? []);
      const firstEver = !seeded && known.size === 0;
      const fresh = newExecutables(known, table);
      if (firstEver) {
        for (const r of fresh) known.add(r.comm);
        await save(file, [...known].slice(-KNOWN_CAP));
        return { findings: 0 };
      }
      const sessions = (await deps.agentSessions?.()) ?? new Map<number, string>();
      const roots = new Set(sessions.keys());
      let n = 0;
      for (const row of fresh.slice(0, INSPECT_CAP)) {
        known.add(row.comm);
        const signature = await inspectExecutable(ctx.runProcess, row.comm, ctx.signal);
        const agentSpawned = underAgentSession(row.pid, table, roots);
        const parent = table.find((r) => r.pid === row.ppid);
        const { severity, reasons } = classifyProcess({
          path: row.comm,
          signature,
          home,
          agentSpawned,
          parentIsShell: parent !== undefined && isShellComm(parent.comm),
        });
        if (severity === null) continue;
        const sessionId = agentSpawned ? sessionOf(row.pid, table, sessions) : undefined;
        const evidence: EvidenceItem[] = [
          { kind: 'pid', pid: row.pid, command: row.comm, ppid: row.ppid, uid: row.uid },
          { kind: 'path', path: row.comm },
        ];
        if (signature.teamId !== undefined)
          evidence.push({ kind: 'command', command: `team id ${signature.teamId}` });
        const remediation: RemediationAction[] = [{ id: 'kill-process-group', pid: row.pid }];
        if (sessionId !== undefined) remediation.push({ id: 'pause-session', sessionId });
        remediation.push({ id: 'quarantine-file', path: row.comm }, { id: 'mute' });
        await ctx.record({
          fingerprint: `process:${row.comm}`,
          severity,
          category: 'process',
          title: `New executable running: ${row.comm.split('/').pop() ?? row.comm}`,
          detail: `${row.comm} appeared in the process table (pid ${row.pid}): ${reasons.join('; ') || 'no signature concerns'}.`,
          evidence,
          remediation,
          ...(sessionId !== undefined ? { sessionId } : {}),
        });
        n += 1;
      }
      if (fresh.length > 0) await save(file, [...known].slice(-KNOWN_CAP));
      return { findings: n };
    },
  };
}

function sessionOf(
  pid: number,
  table: readonly ProcessRow[],
  sessions: ReadonlyMap<number, string>,
): string | undefined {
  const byPid = new Map(table.map((r) => [r.pid, r]));
  const seen = new Set<number>();
  for (let cur = byPid.get(pid); cur !== undefined && !seen.has(cur.pid); cur = byPid.get(cur.ppid)) {
    const id = sessions.get(cur.pid);
    if (id !== undefined) return id;
    seen.add(cur.pid);
  }
  return undefined;
}
