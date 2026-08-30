import type { Commit, GraphRow } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { colorForSha } from './colors';
import { LaneLayoutSession, layoutGraph } from './lane-layout';

/**
 * Synthetic DAGs are written parent-last, the order `git log --topo-order`
 * emits: a commit always appears before its parents.
 */
const commit = (sha: string, parents: string[] = []): Commit => ({
  sha,
  parents,
  authorName: 'Test',
  authorEmail: 'test@example.com',
  authorDate: 0,
  committerDate: 0,
  subject: sha,
  refs: [],
});

/** `A -> [B, C]` reads as "A's parents are B and C". */
const dag = (spec: Record<string, string[]>, order: string[]): Commit[] =>
  order.map((sha) => commit(sha, spec[sha] ?? []));

const laneOf = (rows: GraphRow[], sha: string): number | undefined =>
  rows.find((r) => r.commit.sha === sha)?.lane;

/**
 * The invariant the whole layout rests on: no two *lanes* may share a column.
 *
 * Stated as edges, that means within one row:
 *   - at most one `straight` edge per lane (a lane passes through once),
 *   - at most one `branch` edge per source lane (a lane terminates once),
 *   - at most one `merge` edge per target lane (a lane is entered once),
 *   - and a lane never both passes through and terminates.
 *
 * A `merge` edge landing on a lane that also has a `straight` edge is NOT a
 * collision — that is a join, the ordinary picture of a branch line meeting the
 * mainline, and forbidding it would make every merge unrenderable.
 */
const assertNoLaneCollisions = (rows: GraphRow[]): void => {
  for (const row of rows) {
    const passing = new Set<number>();
    const terminating = new Set<number>();
    const entering = new Set<number>();

    for (const edge of row.edges) {
      if (edge.type === 'straight') {
        expect(edge.fromLane).toBe(edge.toLane);
        expect(passing.has(edge.fromLane)).toBe(false);
        passing.add(edge.fromLane);
      } else if (edge.type === 'branch') {
        expect(terminating.has(edge.fromLane)).toBe(false);
        terminating.add(edge.fromLane);
      } else {
        expect(edge.fromLane).toBe(row.lane);
        expect(entering.has(edge.toLane)).toBe(false);
        entering.add(edge.toLane);
      }
    }

    for (const lane of terminating) expect(passing.has(lane)).toBe(false);
  }
};

/** Every lane index used must fit inside the row's declared width. */
const assertLaneCountCoversEdges = (rows: GraphRow[]): void => {
  for (const row of rows) {
    expect(row.lane).toBeLessThan(row.laneCount);
    for (const edge of row.edges) {
      expect(edge.fromLane).toBeLessThan(row.laneCount);
      expect(edge.toLane).toBeLessThan(row.laneCount);
    }
  }
};

describe('linear history', () => {
  const rows = layoutGraph(dag({ C: ['B'], B: ['A'], A: [] }, ['C', 'B', 'A']));

  it('keeps every commit in lane 0', () => {
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(rows.map((r) => r.laneCount)).toEqual([1, 1, 1]);
  });

  it('draws the tip lower-half, the middle full-height and the root upper-half', () => {
    // A tip has nothing above it, a root nothing below it — encoding that in
    // the edge type is what stops the renderer drawing a line into empty space.
    expect(rows[0]?.edges).toEqual([{ fromLane: 0, toLane: 0, type: 'merge', colorIdx: colorForSha('C') }]);
    expect(rows[1]?.edges).toEqual([{ fromLane: 0, toLane: 0, type: 'straight', colorIdx: colorForSha('C') }]);
    expect(rows[2]?.edges).toEqual([{ fromLane: 0, toLane: 0, type: 'branch', colorIdx: colorForSha('C') }]);
  });

  it('carries the tip colour down the whole lane', () => {
    expect(new Set(rows.map((r) => r.colorIdx)).size).toBe(1);
  });

  it('holds the invariants', () => {
    assertNoLaneCollisions(rows);
    assertLaneCountCoversEdges(rows);
  });
});

describe('a single merge', () => {
  //   M          merge of F into main
  //   |\
  //   | F        feature
  //   B |        main
  //   |/
  //   A
  const rows = layoutGraph(
    dag({ M: ['B', 'F'], B: ['A'], F: ['A'], A: [] }, ['M', 'B', 'F', 'A']),
  );

  it('puts the merge and its first parent in the same lane', () => {
    expect(laneOf(rows, 'M')).toBe(0);
    expect(laneOf(rows, 'B')).toBe(0);
  });

  it('opens a second lane for the merged-in parent', () => {
    expect(laneOf(rows, 'F')).toBe(1);
  });

  it('emits a merge edge from the merge commit into the new lane', () => {
    const merge = rows[0]?.edges.find((e) => e.type === 'merge' && e.toLane === 1);
    expect(merge).toMatchObject({ fromLane: 0, toLane: 1 });
  });

  it('brings both lanes back together at the shared root', () => {
    const root = rows.find((r) => r.commit.sha === 'A');
    // Lane 1 converges into lane 0 with an upper-half branch edge.
    expect(root?.edges).toContainEqual(
      expect.objectContaining({ type: 'branch', fromLane: 1, toLane: 0 }),
    );
    expect(root?.lane).toBe(0);
  });

  it('recycles lane 1 once the branch has closed', () => {
    // Nothing after the root, so the width must have collapsed back to one.
    expect(rows.at(-1)?.laneCount).toBe(2);
    const session = new LaneLayoutSession();
    session.push(dag({ M: ['B', 'F'], B: ['A'], F: ['A'], A: [] }, ['M', 'B', 'F', 'A']));
    // A later independent tip should reuse the freed column, not append a third.
    const [extra] = session.push([commit('Z', [])]);
    expect(extra?.lane).toBe(0);
  });

  it('holds the invariants', () => {
    assertNoLaneCollisions(rows);
    assertLaneCountCoversEdges(rows);
  });
});

describe('octopus merge', () => {
  //   O with three parents
  const rows = layoutGraph(
    dag(
      { O: ['P1', 'P2', 'P3'], P1: ['R'], P2: ['R'], P3: ['R'], R: [] },
      ['O', 'P1', 'P2', 'P3', 'R'],
    ),
  );

  it('opens one lane per extra parent', () => {
    expect(laneOf(rows, 'P1')).toBe(0);
    expect(laneOf(rows, 'P2')).toBe(1);
    expect(laneOf(rows, 'P3')).toBe(2);
  });

  it('emits a merge edge to each extra parent', () => {
    const merges = rows[0]?.edges.filter((e) => e.type === 'merge') ?? [];
    expect(merges.map((e) => e.toLane).sort()).toEqual([0, 1, 2]);
  });

  it('collapses all three lanes at the shared root', () => {
    const root = rows.at(-1);
    expect(root?.lane).toBe(0);
    // Lane 0's own branch edge is the root terminating its own lane; the other
    // two are the siblings converging into it.
    const converging = (root?.edges ?? []).filter(
      (e) => e.type === 'branch' && e.fromLane !== root?.lane,
    );
    expect(converging.map((e) => e.fromLane).sort()).toEqual([1, 2]);
  });

  it('holds the invariants', () => {
    assertNoLaneCollisions(rows);
    assertLaneCountCoversEdges(rows);
  });
});

describe('criss-cross merges', () => {
  // Two branches that merged each other — the classic case a naive layout
  // tangles, because two lanes are waiting for the same commit at once.
  //   X   Y
  //   |\ /|
  //   | X |
  //   |/ \|
  //   A   B
  const rows = layoutGraph(
    dag(
      { X: ['A', 'B'], Y: ['B', 'A'], A: ['R'], B: ['R'], R: [] },
      ['X', 'Y', 'A', 'B', 'R'],
    ),
  );

  it('lays out every commit exactly once', () => {
    expect(rows.map((r) => r.commit.sha)).toEqual(['X', 'Y', 'A', 'B', 'R']);
  });

  it('holds the invariants', () => {
    assertNoLaneCollisions(rows);
    assertLaneCountCoversEdges(rows);
  });
});

describe('orphan branches', () => {
  // Two disconnected roots — an imported history, or `checkout --orphan`.
  const rows = layoutGraph(dag({ A: ['A0'], A0: [], B: ['B0'], B0: [] }, ['A', 'A0', 'B', 'B0']));

  it('gives each root its own lane while it is alive', () => {
    expect(laneOf(rows, 'A')).toBe(0);
    expect(laneOf(rows, 'A0')).toBe(0);
    // The first orphan's lane frees at its root, so the second reuses column 0.
    expect(laneOf(rows, 'B')).toBe(0);
  });

  it('colours the two orphans independently', () => {
    expect(laneOf(rows, 'A')).toBe(laneOf(rows, 'B'));
    expect(rows[0]?.colorIdx).toBe(colorForSha('A'));
    expect(rows[2]?.colorIdx).toBe(colorForSha('B'));
  });

  it('holds the invariants', () => {
    assertNoLaneCollisions(rows);
    assertLaneCountCoversEdges(rows);
  });
});

describe('a commit with several children', () => {
  //   C1  C2      two tips
  //    \  /
  //     P         both point at P
  const rows = layoutGraph(dag({ C1: ['P'], C2: ['P'], P: [] }, ['C1', 'C2', 'P']));

  it('draws P in the leftmost of the lanes waiting for it', () => {
    expect(laneOf(rows, 'C1')).toBe(0);
    expect(laneOf(rows, 'C2')).toBe(1);
    expect(laneOf(rows, 'P')).toBe(0);
  });

  it('closes the other lane into P', () => {
    expect(rows[2]?.edges).toContainEqual(
      expect.objectContaining({ type: 'branch', fromLane: 1, toLane: 0 }),
    );
  });
});

describe('streaming', () => {
  const spec = { M: ['B', 'F'], B: ['A'], F: ['A'], A: [] };
  const order = ['M', 'B', 'F', 'A'];

  it('produces the same rows batched as it does in one pass', () => {
    // The streaming log delivers ~500 rows at a time; batching must not be
    // observable in the output or the graph would reflow as it loads.
    const oneShot = layoutGraph(dag(spec, order));

    const session = new LaneLayoutSession();
    const batched = [
      ...session.push(dag(spec, order.slice(0, 1))),
      ...session.push(dag(spec, order.slice(1, 3))),
      ...session.push(dag(spec, order.slice(3))),
    ];

    expect(batched).toEqual(oneShot);
  });

  it('numbers rows continuously across batches', () => {
    const session = new LaneLayoutSession();
    session.push(dag(spec, order.slice(0, 2)));
    const rest = session.push(dag(spec, order.slice(2)));

    expect(rest.map((r) => r.row)).toEqual([2, 3]);
    expect(session.rowCount).toBe(4);
  });
});

describe('truncated history', () => {
  it('leaves a lane open when a parent is below the window', () => {
    // `git log -n 50000` cuts history mid-branch; the bottom row's lanes must
    // still draw downward off the edge rather than terminating.
    const rows = layoutGraph([commit('C', ['B-not-in-window'])]);

    expect(rows[0]?.edges).toEqual([
      { fromLane: 0, toLane: 0, type: 'merge', colorIdx: colorForSha('C') },
    ]);
  });
});

describe('degenerate input', () => {
  it('lays out an empty history', () => {
    expect(layoutGraph([])).toEqual([]);
  });

  it('lays out a single root commit with no edges at all', () => {
    const [row] = layoutGraph([commit('A', [])]);
    expect(row?.lane).toBe(0);
    expect(row?.edges).toEqual([]);
  });

  it('ignores a duplicated parent in an octopus merge', () => {
    // A malformed-but-possible object: two lanes would wait for one commit and
    // the second could never close.
    const rows = layoutGraph(dag({ M: ['A', 'A'], A: [] }, ['M', 'A']));
    const merges = rows[0]?.edges.filter((e) => e.type === 'merge') ?? [];

    expect(merges).toHaveLength(1);
    expect(rows[1]?.lane).toBe(0);
    assertNoLaneCollisions(rows);
  });
});

describe('snapshots', () => {
  const render = (rows: GraphRow[]) =>
    rows.map((r) => ({
      sha: r.commit.sha,
      lane: r.lane,
      width: r.laneCount,
      edges: r.edges.map((e) => `${e.type}:${e.fromLane}->${e.toLane}`),
    }));

  it('lays out a branch, a merge and a subsequent tip', () => {
    //   T          a tip on main after the merge
    //   M
    //   |\
    //   B F
    //   |/
    //   A
    const rows = layoutGraph(
      dag({ T: ['M'], M: ['B', 'F'], B: ['A'], F: ['A'], A: [] }, ['T', 'M', 'B', 'F', 'A']),
    );
    expect(render(rows)).toMatchInlineSnapshot(`
      [
        {
          "edges": [
            "merge:0->0",
          ],
          "lane": 0,
          "sha": "T",
          "width": 1,
        },
        {
          "edges": [
            "straight:0->0",
            "merge:0->1",
          ],
          "lane": 0,
          "sha": "M",
          "width": 2,
        },
        {
          "edges": [
            "straight:0->0",
            "straight:1->1",
          ],
          "lane": 0,
          "sha": "B",
          "width": 2,
        },
        {
          "edges": [
            "straight:0->0",
            "straight:1->1",
          ],
          "lane": 1,
          "sha": "F",
          "width": 2,
        },
        {
          "edges": [
            "branch:0->0",
            "branch:1->0",
          ],
          "lane": 0,
          "sha": "A",
          "width": 2,
        },
      ]
    `);
  });
});
