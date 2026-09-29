import { describe, expect, it } from 'vitest';

import type { GraphRow } from '@midnite/studio-shared';

import { lanesLeaving } from './inline-expansion';

const row = (edges: GraphRow['edges']): GraphRow =>
  ({
    row: 0,
    commit: {} as GraphRow['commit'],
    lane: 1,
    colorIdx: 1,
    edges,
    laneCount: 3,
  }) as GraphRow;

describe('lanesLeaving', () => {
  it('is every lane crossing the row bottom — straight pass-throughs and merge exits, not branch arrivals', () => {
    expect(
      lanesLeaving(
        row([
          { fromLane: 0, toLane: 0, type: 'straight', colorIdx: 0 },
          { fromLane: 2, toLane: 1, type: 'branch', colorIdx: 2 },
          { fromLane: 1, toLane: 1, type: 'merge', colorIdx: 1 },
          { fromLane: 1, toLane: 2, type: 'merge', colorIdx: 5 },
        ]),
      ),
    ).toEqual([
      { lane: 0, colorIdx: 0 },
      { lane: 1, colorIdx: 1 },
      { lane: 2, colorIdx: 5 },
    ]);
  });

  it('a root commit leaves nothing below it', () => {
    expect(lanesLeaving(row([{ fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 }]))).toEqual([]);
  });
});
