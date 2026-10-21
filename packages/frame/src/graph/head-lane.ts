import type { GraphRow } from '@midnite/studio-shared';

import { HEAD_LANE_IDX } from './lane-colors';

/**
 * The checked-out branch's lane, as a span of the loaded rows.
 *
 * git-engine colours a lane by a hash of the sha that opened it and knows
 * nothing of HEAD, and lane layout stays in main. So the renderer finds HEAD's
 * lane itself: it is the column HEAD's row sits in, followed down the
 * first-parent chain until that chain either reaches its root or joins a lane
 * that was already open (its commit then lands in another column and this one
 * closes). Detached HEAD is the same walk from the HEAD commit.
 *
 * Recolouring is by span and column, NOT by `colorIdx`, so another lane that
 * happens to share HEAD's hashed palette slot keeps its own colour.
 */
export type HeadLaneSpan = {
  /** Row index of the HEAD commit. */
  from: number;
  /** Last row index (inclusive) at which the lane's column is still HEAD's. */
  to: number;
  lane: number;
};

export function findHeadLane(
  rows: readonly GraphRow[],
  count: number,
  headOid: string | null,
): HeadLaneSpan | null {
  if (headOid === null) return null;
  let from = -1;
  for (let i = 0; i < count; i += 1) {
    if (rows[i]!.commit.sha === headOid) {
      from = i;
      break;
    }
  }
  if (from < 0) return null;
  const head = rows[from]!;
  const lane = head.lane;
  let expected: string | undefined = head.commit.parents[0];
  let to = expected === undefined ? from : count - 1;
  for (let i = from + 1; expected !== undefined && i < count; i += 1) {
    const row = rows[i]!;
    if (row.commit.sha !== expected) continue;
    if (row.lane !== lane) {
      // The chain joined a lane that was already open: our column closes here,
      // with a branch edge into the other lane.
      to = i;
      break;
    }
    expected = row.commit.parents[0];
    if (expected === undefined) to = i;
  }
  return { from, to, lane };
}

const cache = new WeakMap<GraphRow, { span: HeadLaneSpan; index: number; out: GraphRow }>();

/**
 * `row` with the HEAD lane's node and edges moved onto the reserved HEAD colour.
 * Returns the same object when nothing changes, and the same recoloured object
 * for the same span, so memoised rows keep their identity between renders.
 */
export function applyHeadLane(
  row: GraphRow,
  index: number,
  span: HeadLaneSpan | null,
): GraphRow {
  if (span === null || index < span.from || index > span.to) return row;
  const hit = cache.get(row);
  if (hit && hit.index === index && hit.span.from === span.from && hit.span.to === span.to && hit.span.lane === span.lane) {
    return hit.out;
  }
  const { lane } = span;
  // A merge edge leaves the node, so its colour is its TARGET lane's; every
  // other edge is coloured by the column it starts in.
  const edges = row.edges.map((edge) =>
    (edge.type === 'merge' ? edge.toLane === lane : edge.fromLane === lane)
      ? { ...edge, colorIdx: HEAD_LANE_IDX }
      : edge,
  );
  const changed = edges.some((edge, i) => edge !== row.edges[i]);
  const nodeOnLane = row.lane === lane;
  const out =
    changed || nodeOnLane
      ? { ...row, colorIdx: nodeOnLane ? HEAD_LANE_IDX : row.colorIdx, edges }
      : row;
  cache.set(row, { span, index, out });
  return out;
}
