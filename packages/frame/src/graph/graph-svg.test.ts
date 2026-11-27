import type { GraphRow } from '@midnite/studio-shared';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { edgePath, GraphSvg } from './graph-svg';
import { GRAPH_THEMES, type GraphTheme } from './graph-themes';
import { createTestGitUi, makeTestGitHost, renderWithGitHost } from './test-host';

const withEdge = (edge: GraphTheme['edge'], cornerRadius = 8): GraphTheme => ({
  ...GRAPH_THEMES['git-graph'],
  edge,
  cornerRadius,
});

/** Every coordinate in a path, in order. */
const numbers = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('edgePath', () => {
  it('draws a straight style as a single line segment', () => {
    expect(edgePath(withEdge('straight'), 10, 0, 30, 15)).toBe('M 10 0 L 30 15');
  });

  it('draws a bezier with vertical control points, so lanes join smoothly', () => {
    // Both control points share their endpoint's x, which is what makes a
    // branch read as one continuous line through the rows above and below.
    expect(edgePath(withEdge('bezier'), 10, 0, 30, 16)).toBe(
      'M 10 0 C 10 8, 30 8, 30 16',
    );
  });

  describe('orthogonal', () => {
    it('never folds back, whichever way the lane moves', () => {
      // The horizontal run must travel in the same direction as dx. A corner
      // radius wider than half the run would otherwise overlap the two arcs
      // and double the path back on itself.
      const cases: [number, number][] = [
        [10, 40],
        [40, 10],
      ];
      for (const [startX, endX] of cases) {
        const d = edgePath(withEdge('orthogonal'), startX, 0, endX, 16);
        const xs = numbers(d).filter((_, i) => i % 2 === 0);
        const direction = Math.sign(endX - startX);
        for (let i = 1; i < xs.length; i += 1) {
          const step = (xs[i] ?? 0) - (xs[i - 1] ?? 0);
          expect(Math.sign(step) === direction || step === 0).toBe(true);
        }
      }
    });

    it('clamps the corner to half the shorter run', () => {
      // A 4px horizontal move cannot carry an 8px radius on both corners.
      const d = edgePath(withEdge('orthogonal', 8), 10, 0, 14, 16);
      expect(d).toContain('M 10 0');
      expect(d).toContain('14 16');
      expect(numbers(d).some(Number.isNaN)) .toBe(false);
    });

    it('starts and ends exactly where it was told to', () => {
      const d = edgePath(withEdge('orthogonal'), 12, 3, 36, 19);
      expect(d.startsWith('M 12 3')).toBe(true);
      expect(d.endsWith('L 36 19')).toBe(true);
    });

    it('emits one path, not three strokes meeting at a corner', () => {
      // Separate elements leave visible notches at any width above a hairline.
      expect(edgePath(withEdge('orthogonal'), 10, 0, 30, 16).match(/M /g)).toHaveLength(1);
    });
  });
});

describe('GraphSvg pass-through lanes (Phase 77 Theme B)', () => {
  const theme = GRAPH_THEMES['git-graph'];
  const commit = {
    sha: 's', parents: [], authorName: '', authorEmail: '', authorDate: 0, committerDate: 0,
    subject: '', refs: [], coAuthors: [], sessionTrailers: [],
  };
  const base = { row: 0, commit, lane: 1, colorIdx: 1, laneCount: 4 };
  const straight = (lane: number, colorIdx: number) => ({ fromLane: lane, toLane: lane, type: 'straight' as const, colorIdx });

  /** The multiset of full-height verticals actually painted, as `x|stroke`, sorted. */
  const verticals = (row: GraphRow, glowColorIdx: number | null = null): string[] => {
    const { container, unmount } = renderWithGitHost(
      createElement(GraphSvg, { row, width: 120, theme, laneWidth: theme.laneWidth, clipId: 'c', glowColorIdx }),
      makeTestGitHost(createTestGitUi()),
    );
    const found = [...container.querySelectorAll('line')]
      .filter((l) => l.getAttribute('x1') === l.getAttribute('x2') && l.getAttribute('y1') === '0' && l.getAttribute('y2') === String(theme.rowHeight))
      .map((l) => `${l.getAttribute('x1')}|${l.getAttribute('stroke')}`)
      .sort();
    unmount();
    return found;
  };

  // Lanes 0, 2 and 3 pass through; lane 1 is the commit's own continuing lane.
  const viaEdges: GraphRow = {
    ...base,
    through: [],
    edges: [straight(0, 4), straight(1, 1), straight(2, 6), straight(3, 7)],
  };
  const viaThrough: GraphRow = { ...base, through: [4, -1, 6, 7], edges: [straight(1, 1)] };

  it('paints the same multiset of {lane, colour} verticals whether they arrive in edges or through', () => {
    const before = verticals(viaEdges);
    expect(before).toHaveLength(4);
    expect(verticals(viaThrough)).toEqual(before);
  });

  it('keeps the same multiset in the glow halo layer', () => {
    // colour 6 is lane 2's; the halo copies only edges of the glowing colour.
    expect(verticals(viaThrough, 6)).toEqual(verticals(viaEdges, 6));
    const withGlow = verticals(viaThrough, 6);
    expect(withGlow.length).toBe(verticals(viaThrough).length + 1);
  });

  it('draws nothing for a -1 (empty or touched) lane', () => {
    expect(verticals({ ...base, through: [-1, -1], edges: [] })).toEqual([]);
  });
});
