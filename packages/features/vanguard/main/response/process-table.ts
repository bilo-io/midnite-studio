/**
 * The process table as the response actions need it (Phase 120 Theme H): who is in a process group, who
 * owns each process, when it started, and which executable it runs. Pure parsers over `ps` output, so the
 * kill action's blast radius and its stale-target check are fixture-tested.
 *
 * `etime` rather than `lstart`: `lstart` prints a locale-formatted date, `etime` is `[[dd-]hh:]mm:ss` in
 * every locale. `comm` is last because it is the one column that can hold spaces (an `.app` path).
 */

export const PS = '/bin/ps';
export const GROUP_PS_ARGS: readonly string[] = ['-axww', '-o', 'pid=,ppid=,pgid=,uid=,etime=,comm='];

export interface GroupPsRow {
  pid: number;
  ppid: number;
  pgid: number;
  uid: number;
  /** Seconds since the process started. */
  elapsedSeconds: number;
  /** The executable's path (macOS `ps` prints the full path for `comm`). */
  comm: string;
}

/** `[[dd-]hh:]mm:ss` to seconds; null when it is not that shape. */
export function parseEtime(raw: string): number | null {
  const m = /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(raw.trim());
  if (!m) return null;
  const [, days, hours, minutes, seconds] = m;
  return Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3_600 + Number(minutes) * 60 + Number(seconds);
}

export function parseGroupPs(output: string): GroupPsRow[] {
  const rows: GroupPsRow[] = [];
  for (const line of output.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*\S)\s*$/.exec(line);
    if (!m) continue;
    const elapsedSeconds = parseEtime(m[5]!);
    if (elapsedSeconds === null) continue;
    rows.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      pgid: Number(m[3]),
      uid: Number(m[4]),
      elapsedSeconds,
      comm: m[6]!,
    });
  }
  return rows;
}

/** `ps -ww -o pid=,args= -p …`: each member's full command line, for the broker-marker check. */
export function parsePidArgs(output: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const line of output.split('\n')) {
    const m = /^\s*(\d+)\s+(.*\S)\s*$/.exec(line);
    if (m) out.set(Number(m[1]), m[2]!);
  }
  return out;
}

/** `pid` and every process above it, up to (not including) launchd. */
export function ancestorsOf(rows: readonly GroupPsRow[], pid: number): Set<number> {
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const seen = new Set<number>([pid]);
  let current = byPid.get(pid);
  while (current && current.ppid > 1 && !seen.has(current.ppid)) {
    seen.add(current.ppid);
    current = byPid.get(current.ppid);
  }
  return seen;
}

const base = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/**
 * Does the running process still look like the one the finding names? A full path must match exactly; a bare
 * name (lsof's `c` field, truncated to a few characters) must agree with the executable's basename as a prefix
 * either way round.
 */
export function commMatches(comm: string, recorded: string): boolean {
  if (recorded.includes('/')) return comm === recorded;
  const name = base(comm);
  return recorded.length > 0 && (name.startsWith(recorded) || recorded.startsWith(name));
}
