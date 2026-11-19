// vitest/jsdom: the Graph view's pure geometry (Phase 146 H4). The pinch and pan gestures themselves need a device.
import { describe, expect, it } from 'vitest';
import type { PositionedEdge, PositionedNode } from '@midnite/tasks-core';
import { MAX_SCALE, MIN_SCALE, clampScale, cullToViewport, edgePath, panBy, viewportRect, zoomAt } from './graph-geometry';

const node = (key: string, x: number, y: number) => ({ key, x, y }) as unknown as PositionedNode;

describe('graph geometry', () => {
  it('draws a horizontal-control cubic between ports', () => {
    expect(edgePath(0, 10, 100, 50)).toBe('M 0 10 C 50 10, 50 50, 100 50');
  });
  it('clamps scale to 0.3..2.5', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(1)).toBe(1);
  });
  it('zooming keeps the point under the fingers fixed', () => {
    const v = { x: 100, y: 50, scale: 1 };
    const z = zoomAt(v, 2, 40, 30);
    expect(z.scale).toBe(2);
    // graph point under (40,30) is (140,80) before and after
    expect(z.x + 40 / z.scale).toBeCloseTo(140);
    expect(z.y + 30 / z.scale).toBeCloseTo(80);
    expect(zoomAt(v, 100, 0, 0).scale).toBe(MAX_SCALE);
  });
  it('dragging right moves the viewport origin left, scaled', () => {
    expect(panBy({ x: 0, y: 0, scale: 2 }, 20, -10)).toEqual({ x: -10, y: 5, scale: 2 });
  });
  it('culls nodes and edges outside the viewport plus margin', () => {
    const nodes = [node('a', 0, 0), node('b', 5000, 0), node('c', 5000, 300)];
    const edges = [
      { from: 'a', to: 'b', kind: 'blocks', source: 'api' },
      { from: 'b', to: 'c', kind: 'blocks', source: 'api' },
    ] as PositionedEdge[];
    const visible = viewportRect({ x: 0, y: 0, scale: 1 }, 400, 800, 200);
    const out = cullToViewport(nodes, edges, visible);
    expect(out.nodes.map((n) => n.key)).toEqual(['a']);
    expect(out.edges).toHaveLength(1); // a-b's box reaches the viewport; b-c's does not
  });
});
