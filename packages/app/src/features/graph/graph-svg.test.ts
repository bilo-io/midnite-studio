import { describe, expect, it } from 'vitest';

import { edgePath } from './graph-svg';
import { GRAPH_THEMES, type GraphTheme } from './graph-themes';

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
