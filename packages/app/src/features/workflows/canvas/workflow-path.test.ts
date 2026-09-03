import { describe, expect, it } from 'vitest';

import {
  clientToGraph,
  dragDeltaToGraph,
  edgePath,
  inPort,
  nodeBounds,
  outPort,
  panBy,
  rectsIntersect,
  snapToGrid,
  viewportRect,
  zoomAtPointer,
} from './workflow-path';
import { WORKFLOW_NODE_GEOMETRY } from './workflow-geometry';

describe('ports', () => {
  it('places out on the right edge and in on the left edge, both vertically centred', () => {
    const node = { x: 100, y: 200 };
    expect(outPort(node)).toEqual({ x: 100 + WORKFLOW_NODE_GEOMETRY.width, y: 200 + WORKFLOW_NODE_GEOMETRY.height / 2 });
    expect(inPort(node)).toEqual({ x: 100, y: 200 + WORKFLOW_NODE_GEOMETRY.height / 2 });
  });
});

describe('edgePath', () => {
  it('uses horizontal control points — the transpose of the commit graph bezier', () => {
    const d = edgePath(0, 10, 100, 50);
    // Both control points share x = midpoint; the commit graph's own bezier
    // shares y instead, since it flows the other axis.
    expect(d).toBe('M 0 10 C 50 10, 50 50, 100 50');
  });
});

describe('rectsIntersect / nodeBounds', () => {
  it('detects overlap and non-overlap', () => {
    const a = nodeBounds({ x: 0, y: 0 });
    const b = nodeBounds({ x: 50, y: 0 });
    const farAway = nodeBounds({ x: 10_000, y: 10_000 });
    expect(rectsIntersect(a, b)).toBe(true);
    expect(rectsIntersect(a, farAway)).toBe(false);
  });
});

describe('clientToGraph / dragDeltaToGraph / panBy', () => {
  it('divides by scale, independent of container size', () => {
    const viewport = { x: 10, y: 20, scale: 2 };
    expect(clientToGraph(viewport, 100, 40)).toEqual({ x: 60, y: 40 });
    expect(dragDeltaToGraph(viewport, 20, 10)).toEqual({ dx: 10, dy: 5 });
    expect(panBy(viewport, 20, 10)).toEqual({ x: 20, y: 25, scale: 2 });
  });
});

describe('viewportRect', () => {
  it('widens the visible rect by the culling margin on every side', () => {
    const rect = viewportRect({ x: 0, y: 0, scale: 1 }, 800, 600, 50);
    expect(rect).toEqual({ x: -50, y: -50, width: 900, height: 700 });
  });
});

describe('zoomAtPointer', () => {
  it('keeps the graph point under the cursor fixed across a zoom change', () => {
    const viewport = { x: 30, y: 15, scale: 1 };
    const localX = 120;
    const localY = 80;
    const before = clientToGraph(viewport, localX, localY);

    const zoomed = zoomAtPointer(viewport, localX, localY, 1.75);
    const after = clientToGraph(zoomed, localX, localY);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomed.scale).toBe(1.75);
  });

  it('clamps to the zoom bounds', () => {
    expect(zoomAtPointer({ x: 0, y: 0, scale: 1 }, 0, 0, 10).scale).toBe(2);
    expect(zoomAtPointer({ x: 0, y: 0, scale: 1 }, 0, 0, 0.01).scale).toBe(0.25);
  });
});

describe('snapToGrid', () => {
  it('rounds to the nearest multiple of the step', () => {
    expect(snapToGrid(19, 16)).toBe(16);
    expect(snapToGrid(9, 16)).toBe(16);
    expect(snapToGrid(0, 16)).toBe(0);
  });
});
