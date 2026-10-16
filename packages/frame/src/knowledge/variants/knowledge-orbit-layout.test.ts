// Layer: vitest — pure math, no WebGL/canvas/store involved. Real coverage
// for the tween that carries nodes to these coordinates is
// `use-sigma-graph.tsx`'s own `beginPositionTween`, exercised through
// `knowledge-canvas.spec.ts`'s Playwright suite (real `requestAnimationFrame`).
import { describe, expect, it } from 'vitest';

import { computeOrbitPositions } from './knowledge-orbit-layout';

function node(id: string, communityName: string) {
  return { id, communityName };
}

describe('computeOrbitPositions', () => {
  it('places every node from the payload', () => {
    const nodes = [node('a', 'x'), node('b', 'x'), node('c', 'y')];
    const positions = computeOrbitPositions(nodes, {
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      c: { x: -10, y: 0 },
    });
    expect(positions.size).toBe(3);
    for (const n of nodes) expect(positions.has(n.id)).toBe(true);
  });

  it('is deterministic — same payload, same coordinates every time', () => {
    const nodes = [node('a', 'x'), node('b', 'y'), node('c', 'y'), node('d', 'z')];
    const atlasPositions = { a: { x: 1, y: 1 }, b: { x: 2, y: 2 }, c: { x: 3, y: 3 }, d: { x: 4, y: 4 } };
    const first = computeOrbitPositions(nodes, atlasPositions);
    const second = computeOrbitPositions(nodes, atlasPositions);
    for (const n of nodes) expect(first.get(n.id)).toEqual(second.get(n.id));
  });

  it('gives every member of a community the same ring radius', () => {
    const nodes = [node('a', 'x'), node('b', 'x'), node('c', 'x')];
    const positions = computeOrbitPositions(nodes, {
      a: { x: 0, y: 0 },
      b: { x: 0, y: 0 },
      c: { x: 0, y: 0 },
    });
    const radii = nodes.map((n) => {
      const p = positions.get(n.id)!;
      return Math.hypot(p.x, p.y);
    });
    expect(radii[0]).toBeCloseTo(radii[1]!, 5);
    expect(radii[1]).toBeCloseTo(radii[2]!, 5);
  });

  it('spaces different communities onto different ring radii', () => {
    const nodes = [node('a', 'x'), node('b', 'y')];
    const positions = computeOrbitPositions(nodes, { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } });
    const ra = Math.hypot(positions.get('a')!.x, positions.get('a')!.y);
    const rb = Math.hypot(positions.get('b')!.x, positions.get('b')!.y);
    expect(ra).not.toBeCloseTo(rb, 3);
  });

  it('returns an empty map for an empty payload', () => {
    expect(computeOrbitPositions([], {}).size).toBe(0);
  });

  it('falls back to the origin for a node missing a laid-out position', () => {
    const positions = computeOrbitPositions([node('a', 'x')], {});
    const p = positions.get('a')!;
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});
