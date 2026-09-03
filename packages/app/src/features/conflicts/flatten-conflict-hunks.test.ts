import { describe, expect, it } from 'vitest';

import type { ConflictedHunk } from '@midnite/studio-shared';

import { flattenConflictHunks } from './flatten-conflict-hunks';

describe('flattenConflictHunks', () => {
  it('flattens context and conflict segments in order, numbering regions from 0', () => {
    const hunks: ConflictedHunk[] = [
      {
        segments: [
          { kind: 'context', lines: ['a'] },
          { kind: 'conflict', region: { ours: ['MAIN'], theirs: ['FEATURE'], base: null } },
          { kind: 'context', lines: ['c'] },
        ],
      },
    ];

    expect(flattenConflictHunks(hunks)).toEqual([
      { kind: 'context', lines: ['a'] },
      { kind: 'conflict', regionIndex: 0, region: { ours: ['MAIN'], theirs: ['FEATURE'], base: null } },
      { kind: 'context', lines: ['c'] },
    ]);
  });

  /**
   * The number this produces has to agree with `locateConflictRegion`'s
   * (git-engine) — that function numbers regions by scanning the WHOLE file
   * top-to-bottom with no notion of hunk boundaries, so a region index sent
   * over `applyConflictHunk`'s IPC has to mean the same thing on both ends.
   */
  it('numbers regions globally across multiple hunks, not per-hunk', () => {
    const hunks: ConflictedHunk[] = [
      {
        segments: [
          { kind: 'conflict', region: { ours: ['a1'], theirs: ['a2'], base: null } },
        ],
      },
      {
        segments: [
          { kind: 'context', lines: ['shared'] },
          { kind: 'conflict', region: { ours: ['b1'], theirs: ['b2'], base: null } },
        ],
      },
    ];

    const items = flattenConflictHunks(hunks);
    const regionIndexes = items
      .filter((item) => item.kind === 'conflict')
      .map((item) => item.regionIndex);

    expect(regionIndexes).toEqual([0, 1]);
  });

  it('carries the diff3 base through unchanged', () => {
    const hunks: ConflictedHunk[] = [
      {
        segments: [
          { kind: 'conflict', region: { ours: ['MAIN'], theirs: ['FEATURE'], base: ['ORIGINAL'] } },
        ],
      },
    ];

    const [item] = flattenConflictHunks(hunks);
    expect(item).toMatchObject({ region: { base: ['ORIGINAL'] } });
  });

  it('flattens to an empty list for a file with no hunks', () => {
    expect(flattenConflictHunks([])).toEqual([]);
  });
});
