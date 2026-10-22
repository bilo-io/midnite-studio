import { isDevToolPath, isHiddenOrTempTarget } from './persistence-parse';
import { isUnsigned, type SignatureState } from './code-signing';
import type { SecurityFindingSeverity } from '@midnite/studio-shared';

/** Pure process-table parsing, diffing and classification for Theme D's process sensor. */

export interface ProcessRow {
  pid: number;
  ppid: number;
  uid: number;
  /** The executable as `ps` prints it (a full path for most processes). */
  comm: string;
  args: string;
}

/** The `ps` invocation the sensor runs. */
export const PS_ARGS = ['-axo', 'pid,ppid,uid,comm,args'] as const;

/**
 * Parses `ps -axo pid,ppid,uid,comm,args`. `comm` may contain spaces (`/Applications/Google Chrome.app/…`),
 * so it is taken as the shortest token prefix that the `args` column then repeats; failing that, the first
 * token. Rows that do not start with three integers (the header, junk) are dropped.
 */
export function parsePsTable(text: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (m === null) continue;
    const rest = m[4]!;
    const tokens = rest.split(/\s+/);
    let comm = tokens[0]!;
    let args = rest.slice(comm.length).trim();
    for (let k = 1; k <= tokens.length; k += 1) {
      const prefix = tokens.slice(0, k).join(' ');
      const after = rest.slice(rest.indexOf(prefix) + prefix.length).trim();
      if (after.startsWith(prefix)) {
        comm = prefix;
        args = after;
        break;
      }
    }
    rows.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      uid: Number(m[3]),
      comm,
      args: args || comm,
    });
  }
  return rows;
}

/** Paths the OS itself ships; inspecting every one of them each pass would cost far more than it finds. */
const SYSTEM_PREFIXES = [
  '/System/',
  '/usr/libexec/',
  '/usr/sbin/',
  '/usr/bin/',
  '/bin/',
  '/sbin/',
  '/Library/Apple/',
  '/Applications/Safari.app/',
];

export const isSystemPath = (p: string): boolean => SYSTEM_PREFIXES.some((s) => p.startsWith(s));

/** Executable paths in `current` that are absolute, not system-shipped, and not in `known`. */
export function newExecutables(
  known: ReadonlySet<string>,
  current: readonly ProcessRow[],
): ProcessRow[] {
  const out = new Map<string, ProcessRow>();
  for (const row of current) {
    if (!row.comm.startsWith('/') || isSystemPath(row.comm) || known.has(row.comm)) continue;
    if (!out.has(row.comm)) out.set(row.comm, row);
  }
  return [...out.values()];
}

const SHELLS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh']);
export const isShellComm = (comm: string): boolean => SHELLS.has(comm.split('/').pop() ?? '');

/** Whether `pid` descends from one of `roots` (the agent pty shells), following `ppid`. */
export function underAgentSession(
  pid: number,
  table: readonly ProcessRow[],
  roots: ReadonlySet<number>,
): boolean {
  if (roots.size === 0) return false;
  const byPid = new Map(table.map((r) => [r.pid, r]));
  const seen = new Set<number>();
  for (
    let cur = byPid.get(pid);
    cur !== undefined && !seen.has(cur.pid);
    cur = byPid.get(cur.ppid)
  ) {
    if (roots.has(cur.pid)) return true;
    seen.add(cur.pid);
  }
  return false;
}

export interface ProcessClassification {
  /** `null`: nothing to report (a signed, Gatekeeper-accepted binary, or an unsigned one nobody cares about). */
  severity: SecurityFindingSeverity | null;
  reasons: string[];
}

/**
 * - unsigned + quarantined + spawned by a shell under an agent session: `critical`
 * - unsigned from a known dev-tool path (`node_modules/.bin`, `~/.cargo/bin`, Homebrew): `info`
 * - unsigned + quarantined elsewhere, or a hidden/temp path: `high`
 * - otherwise unsigned, or refused by Gatekeeper: `medium`
 * - signed and accepted: nothing
 */
export function classifyProcess(input: {
  path: string;
  signature: SignatureState;
  home: string;
  agentSpawned: boolean;
  parentIsShell: boolean;
}): ProcessClassification {
  const { path, signature, home } = input;
  const unsigned = isUnsigned(signature);
  const reasons: string[] = [];
  if (unsigned) reasons.push(signature.signed ? 'ad-hoc signed' : 'not code-signed');
  if (signature.quarantined) reasons.push('still carries the download quarantine flag');
  if (!signature.accepted && signature.signed)
    reasons.push('Gatekeeper would not assess it as acceptable');
  const hidden = isHiddenOrTempTarget(path, home);
  if (hidden) reasons.push('runs from a hidden or temporary location');
  if (input.agentSpawned) reasons.push('started under an agent session');

  if (unsigned && signature.quarantined && input.agentSpawned && input.parentIsShell)
    return { severity: 'critical', reasons };
  if (unsigned && isDevToolPath(path, home) && !signature.quarantined && !hidden)
    return { severity: 'info', reasons };
  if ((unsigned && signature.quarantined) || (unsigned && hidden))
    return { severity: 'high', reasons };
  if (unsigned || (signature.signed && !signature.accepted && signature.quarantined))
    return { severity: 'medium', reasons };
  return { severity: null, reasons: [] };
}
