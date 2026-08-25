import type { GraphRow } from '@midnite/git-shared';

/**
 * Render laid-out rows as ASCII, in the shape `git log --graph` uses.
 *
 * A development aid, not production code: the point is that `smoke.ts` can put
 * our lanes next to git's own drawing of the same history and let a human see
 * whether the topology agrees. Unit tests prove the layout is self-consistent;
 * only this catches "self-consistent but not what git thinks the graph is".
 *
 * Each row renders as up to three lines — the connectors above the node, the
 * node line, and the connectors below — with a connector line emitted only when
 * it actually bends, exactly as git suppresses straight-through connectors.
 */
const CELL = 2;

const blank = (lanes: number): string[] => Array.from({ length: lanes * CELL }, () => ' ');

const put = (line: string[], lane: number, char: string): void => {
  line[lane * CELL] = char;
};

export function renderRow(row: GraphRow): string[] {
  const width = Math.max(row.laneCount, row.lane + 1);
  const upper = blank(width);
  const node = blank(width);
  const lower = blank(width);

  let upperBends = false;
  let lowerBends = false;

  for (const edge of row.edges) {
    if (edge.type === 'straight') {
      put(upper, edge.fromLane, '|');
      put(lower, edge.fromLane, '|');
      if (edge.fromLane !== row.lane) put(node, edge.fromLane, '|');
      continue;
    }

    if (edge.type === 'branch') {
      // Upper half: enters at the top in fromLane, ends at the node.
      if (edge.fromLane === edge.toLane) {
        put(upper, edge.fromLane, '|');
      } else {
        put(upper, edge.fromLane, edge.toLane < edge.fromLane ? '/' : '\\');
        upperBends = true;
      }
      continue;
    }

    // merge — lower half: leaves the node, exits the bottom in toLane.
    if (edge.fromLane === edge.toLane) {
      put(lower, edge.toLane, '|');
    } else {
      put(lower, edge.toLane, edge.toLane > edge.fromLane ? '\\' : '/');
      lowerBends = true;
    }
  }

  put(node, row.lane, row.commit.parents.length > 1 ? 'M' : '*');

  const lines: string[] = [];
  if (upperBends) lines.push(upper.join(''));
  lines.push(node.join(''));
  if (lowerBends) lines.push(lower.join(''));
  return lines;
}

/** Rows as ASCII, each node line annotated with sha + subject. */
export function renderAscii(rows: readonly GraphRow[]): string[] {
  // One gutter width for the whole block, so the labels line up in a column
  // even where the graph narrows.
  const width = Math.max(0, ...rows.map((r) => Math.max(r.laneCount, r.lane + 1) * CELL));
  const out: string[] = [];

  for (const row of rows) {
    for (const line of renderRow(row)) {
      const isNode = line.includes('*') || line.includes('M');
      const label = isNode ? `${row.commit.sha.slice(0, 8)} ${row.commit.subject}` : '';
      out.push(`${line.padEnd(width)} ${label}`.trimEnd());
    }
  }

  return out;
}
