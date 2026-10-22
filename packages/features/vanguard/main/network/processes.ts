/**
 * The process table, as the network sensor needs it (Phase 120 Theme E): `ps -axo pid=,ppid=,args=`,
 * parsed, and walked down from an agent session's pty root. Pure. The shape matches the desktop's
 * `agent-process.ts`, which a feature may not import.
 */

export const PS_ARGS: readonly string[] = ['-axo', 'pid=,ppid=,args='];

export interface PsRow {
  pid: number;
  ppid: number;
  args: string;
}

export function parsePs(output: string): PsRow[] {
  const rows: PsRow[] = [];
  for (const line of output.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/.exec(line);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3]! });
  }
  return rows;
}

/** `root` and every process below it. */
export function subtreeOf(rows: readonly PsRow[], root: number): Set<number> {
  const children = new Map<number, number[]>();
  for (const row of rows) {
    if (row.pid === row.ppid) continue;
    const bucket = children.get(row.ppid);
    if (bucket) bucket.push(row.pid);
    else children.set(row.ppid, [row.pid]);
  }
  const seen = new Set<number>([root]);
  const queue = [root];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return seen;
}
