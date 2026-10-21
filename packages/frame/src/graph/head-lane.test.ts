import type { GraphRow } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { applyHeadLane, findHeadLane } from './head-lane';
import { HEAD_LANE_IDX } from './lane-colors';

const row = (
  i: number,
  sha: string,
  parents: string[],
  lane: number,
  colorIdx: number,
  edges: GraphRow['edges'] = [],
): GraphRow => ({
  row: i,
  commit: {
    sha, parents, authorName: '', authorEmail: '', authorDate: 0, committerDate: 0,
    subject: '', refs: [], coAuthors: [], sessionTrailers: [],
  },
  lane,
  colorIdx,
  edges,
  laneCount: 2,
});
const e = (fromLane: number, toLane: number, type: 'straight' | 'merge' | 'branch', colorIdx: number) => ({
  fromLane, toLane, type, colorIdx,
});

// feat (lane 1, idx 3) tip; main tip m2 (lane 0, idx 3 - hash collision with feat).
// HEAD = feat: f2 -> f1 -> base ; m2 -> base ; base is on lane 0 (the other lane opened first).
const rows: GraphRow[] = [
  row(0, 'm2', ['base'], 0, 3, [e(0, 0, 'straight', 3), e(1, 1, 'straight', 3)]),
  row(1, 'f2', ['f1'], 1, 3, [e(0, 0, 'straight', 3), e(1, 1, 'straight', 3)]),
  row(2, 'f1', ['base'], 1, 3, [e(0, 0, 'straight', 3), e(1, 0, 'merge', 3)]),
  row(3, 'base', [], 0, 3, []),
];

describe('findHeadLane', () => {
  it('follows the first-parent chain until it joins another lane', () => {
    expect(findHeadLane(rows, rows.length, 'f2')).toEqual({ from: 1, to: 3, lane: 1 });
  });
  it('is null for an unloaded HEAD or none', () => {
    expect(findHeadLane(rows, rows.length, 'zzz')).toBeNull();
    expect(findHeadLane(rows, rows.length, null)).toBeNull();
  });
  it('treats a detached HEAD in the middle of a lane as starting there', () => {
    expect(findHeadLane(rows, rows.length, 'f1')?.from).toBe(2);
  });
});

describe('applyHeadLane', () => {
  const span = findHeadLane(rows, rows.length, 'f2')!;
  it('recolours the HEAD lane node and its column edges only', () => {
    const out = applyHeadLane(rows[1]!, 1, span);
    expect(out.colorIdx).toBe(HEAD_LANE_IDX);
    expect(out.edges.map((x) => x.colorIdx)).toEqual([3, HEAD_LANE_IDX]);
  });
  it('leaves a lane sharing the same palette slot alone (no collision with primary)', () => {
    expect(applyHeadLane(rows[0]!, 0, span)).toBe(rows[0]);
    const closing = applyHeadLane(rows[2]!, 2, span);
    expect(closing.edges[0]!.colorIdx).toBe(3);
  });
  it('colours a merge edge by its target lane', () => {
    const merged = row(2, 'x', ['a', 'f2'], 0, 5, [e(0, 1, 'merge', 3), e(0, 0, 'merge', 5)]);
    const out = applyHeadLane(merged, 2, { from: 0, to: 9, lane: 1 });
    expect(out.edges.map((x) => x.colorIdx)).toEqual([HEAD_LANE_IDX, 5]);
    expect(out.colorIdx).toBe(5);
  });
  it('returns stable identities and ignores rows outside the span', () => {
    expect(applyHeadLane(rows[1]!, 1, span)).toBe(applyHeadLane(rows[1]!, 1, span));
    expect(applyHeadLane(rows[0]!, 0, span)).toBe(rows[0]);
    expect(applyHeadLane(rows[1]!, 1, null)).toBe(rows[1]);
  });
});
