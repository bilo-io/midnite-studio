import { describe, expect, it } from 'vitest';

import type { ForgeGraph, ForgeGraphEdge, ForgeGraphNode } from '@midnite/studio-shared';

import { FORGE_GRAPH_GEOMETRY, layoutForgeGraph, topAlignedViewport } from './graph-layout';

function issueNode(number: number, overrides: Partial<ForgeGraphNode> = {}): ForgeGraphNode {
  return {
    itemId: `item-${number}`,
    number,
    repo: '',
    title: `Issue #${number}`,
    kind: 'issue',
    state: 'open',
    blocked: false,
    ready: false,
    unmetBlockerCount: 0,
    foreign: false,
    truncated: false,
    ...overrides,
  };
}

function blocks(from: ForgeGraphNode, to: ForgeGraphNode, source: ForgeGraphEdge['source'] = 'api'): ForgeGraphEdge {
  return { from: `${from.repo}#${from.number}`, to: `${to.repo}#${to.number}`, kind: 'blocks', source };
}

function contains(parent: ForgeGraphNode, child: ForgeGraphNode): ForgeGraphEdge {
  return { from: `${parent.repo}#${parent.number}`, to: `${child.repo}#${child.number}`, kind: 'contains', source: 'api' };
}

function graph(nodes: ForgeGraphNode[], edges: ForgeGraphEdge[]): ForgeGraph {
  return { nodes, edges, truncated: false, totalCount: nodes.length, kind: 'ok' };
}

function rankOf(layout: ReturnType<typeof layoutForgeGraph>, key: string): number {
  const node = layout.nodes.find((n) => n.key === key);
  if (!node) throw new Error(`no node for key ${key}`);
  return node.rank;
}

describe('layoutForgeGraph', () => {
  it('ranks a three-node chain 0/1/2, blockers upstream', () => {
    const a = issueNode(1);
    const b = issueNode(2);
    const c = issueNode(3);
    // b depends on a; c depends on b.
    const result = layoutForgeGraph(graph([a, b, c], [blocks(b, a), blocks(c, b)]));

    expect(rankOf(result, '#1')).toBe(0);
    expect(rankOf(result, '#2')).toBe(1);
    expect(rankOf(result, '#3')).toBe(2);

    const nodeA = result.nodes.find((n) => n.key === '#1')!;
    const nodeB = result.nodes.find((n) => n.key === '#2')!;
    const nodeC = result.nodes.find((n) => n.key === '#3')!;
    expect(nodeB.x).toBeGreaterThan(nodeA.x);
    expect(nodeC.x).toBeGreaterThan(nodeB.x);
  });

  it('ranks a diamond so both middle nodes share a rank, one past the source', () => {
    const a = issueNode(1);
    const b = issueNode(2);
    const c = issueNode(3);
    const d = issueNode(4);
    // b and c both depend on a; d depends on both b and c.
    const result = layoutForgeGraph(graph([a, b, c, d], [blocks(b, a), blocks(c, a), blocks(d, b), blocks(d, c)]));

    expect(rankOf(result, '#1')).toBe(0);
    expect(rankOf(result, '#2')).toBe(1);
    expect(rankOf(result, '#3')).toBe(1);
    expect(rankOf(result, '#4')).toBe(2);
  });

  it('packs disconnected components so their bounding boxes never overlap', () => {
    const a = issueNode(1);
    const x = issueNode(5);
    const b = issueNode(2); // isolated, unrelated to a/x

    const result = layoutForgeGraph(graph([a, x, b], [blocks(x, a)]));

    const boxOf = (keys: string[]) => {
      const nodes = result.nodes.filter((n) => keys.includes(n.key));
      const minY = Math.min(...nodes.map((n) => n.y));
      const maxY = Math.max(...nodes.map((n) => n.y + FORGE_GRAPH_GEOMETRY.height));
      return { minY, maxY };
    };
    const componentOne = boxOf(['#1', '#5']);
    const componentTwo = boxOf(['#2']);

    const disjoint = componentOne.maxY <= componentTwo.minY || componentTwo.maxY <= componentOne.minY;
    expect(disjoint).toBe(true);
  });

  it('lays out an isolated node at the origin with real bounds', () => {
    const a = issueNode(1);
    const result = layoutForgeGraph(graph([a], []));

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.x).toBe(0);
    expect(result.nodes[0]!.y).toBe(0);
    expect(result.bounds.width).toBeGreaterThan(0);
    expect(result.bounds.height).toBeGreaterThan(0);
    expect(Number.isNaN(result.bounds.width)).toBe(false);
  });

  it('terminates on a mutual blockedBy pair, rendering both edges', () => {
    const a = issueNode(1);
    const b = issueNode(2);
    // a says "blocked by b" (source: body, low confidence); b says
    // "blocked by a" (source: api, authoritative) — a real GitHub possibility.
    const edges: ForgeGraphEdge[] = [blocks(a, b, 'body'), blocks(b, a, 'api')];

    const result = layoutForgeGraph(graph([a, b], edges));

    expect(result.edges).toHaveLength(2);
    expect(Number.isFinite(rankOf(result, '#1'))).toBe(true);
    expect(Number.isFinite(rankOf(result, '#2'))).toBe(true);
    // the api-sourced edge (b depends on a) wins the ranking DAG, so a
    // stays upstream of b.
    expect(rankOf(result, '#1')).toBeLessThan(rankOf(result, '#2'));
  });

  it('keeps a contains-only pair on the same rank', () => {
    const parent = issueNode(1);
    const child = issueNode(2);
    const result = layoutForgeGraph(graph([parent, child], [contains(parent, child)]));

    expect(rankOf(result, '#1')).toBe(0);
    expect(rankOf(result, '#2')).toBe(0);
  });

  it('returns zeroed bounds, not NaN, for an empty graph', () => {
    const result = layoutForgeGraph(graph([], []));
    expect(result).toEqual({ nodes: [], edges: [], bounds: { x: 0, y: 0, width: 0, height: 0 } });
  });

  it('is deterministic across repeated calls over the same graph', () => {
    const a = issueNode(1);
    const b = issueNode(2);
    const c = issueNode(3);
    const g = graph([a, b, c], [blocks(b, a), blocks(c, a)]);

    const first = layoutForgeGraph(g);
    const second = layoutForgeGraph(g);
    expect(second).toEqual(first);
  });
});

describe('topAlignedViewport', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 200 };

  it('centres horizontally when the content plus padding fits the canvas', () => {
    const viewport = topAlignedViewport(bounds, 800, 1, 16);
    // extra = 800 - 400 = 400, split evenly => 200px margin each side.
    expect(viewport.x).toBeCloseTo(bounds.x - 200, 5);
    expect(viewport.scale).toBe(1);
  });

  it('left-aligns at padding when the content overflows the canvas', () => {
    const viewport = topAlignedViewport(bounds, 300, 1, 16);
    expect(viewport.x).toBeCloseTo(bounds.x - 16, 5);
  });

  it('pins the top at padding rather than centring vertically, even for a tall graph', () => {
    const shortBounds = { ...bounds, height: 200 };
    const tallBounds = { ...bounds, height: 5000 };
    const short = topAlignedViewport(shortBounds, 800, 1, 16);
    const tall = topAlignedViewport(tallBounds, 800, 1, 16);

    expect(short.y).toBeCloseTo(bounds.y - 16, 5);
    // height has no bearing on y at all — top-aligned, unconditionally.
    expect(tall.y).toBe(short.y);
  });
});
