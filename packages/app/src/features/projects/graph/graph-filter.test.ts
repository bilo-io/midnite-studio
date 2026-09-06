import { describe, expect, it } from 'vitest';

import type { ForgeGraph, ForgeGraphEdge, ForgeGraphNode } from '@midnite/studio-shared';

import { DEFAULT_GRAPH_FACETS, filterForgeGraph, isDefaultGraphFacets, type ProjectGraphFacets } from './graph-filter';
import { nodeKey } from './graph-layout';

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

function foreignNode(number: number, overrides: Partial<ForgeGraphNode> = {}): ForgeGraphNode {
  return issueNode(number, { itemId: '', foreign: true, ...overrides });
}

function blocks(from: ForgeGraphNode, to: ForgeGraphNode, source: ForgeGraphEdge['source'] = 'api'): ForgeGraphEdge {
  return { from: nodeKey(from), to: nodeKey(to), kind: 'blocks', source };
}

function contains(parent: ForgeGraphNode, child: ForgeGraphNode): ForgeGraphEdge {
  return { from: nodeKey(parent), to: nodeKey(child), kind: 'contains', source: 'api' };
}

function graph(nodes: ForgeGraphNode[], edges: ForgeGraphEdge[]): ForgeGraph {
  return { nodes, edges, truncated: false, totalCount: nodes.length, kind: 'ok' };
}

function allIds(nodes: ForgeGraphNode[]): Set<string> {
  return new Set(nodes.map((n) => n.itemId));
}

function run(g: ForgeGraph, facets: ProjectGraphFacets, filteredItemIds: ReadonlySet<string>, selectedNodeKey: string | null = null) {
  return filterForgeGraph(g, { filteredItemIds, facets, selectedNodeKey });
}

describe('isDefaultGraphFacets', () => {
  it('is true for DEFAULT_GRAPH_FACETS itself', () => {
    expect(isDefaultGraphFacets(DEFAULT_GRAPH_FACETS)).toBe(true);
  });

  it('is false once any one facet differs', () => {
    expect(isDefaultGraphFacets({ ...DEFAULT_GRAPH_FACETS, hideIsolated: true })).toBe(false);
    expect(isDefaultGraphFacets({ ...DEFAULT_GRAPH_FACETS, only: 'blocked' })).toBe(false);
    expect(isDefaultGraphFacets({ ...DEFAULT_GRAPH_FACETS, depth: 1 })).toBe(false);
    expect(isDefaultGraphFacets({ ...DEFAULT_GRAPH_FACETS, showContains: true })).toBe(false);
  });
});

describe('filterForgeGraph — item filter', () => {
  it('drops a node whose item did not survive the shared filter, and its edge with it', () => {
    // b (dependent) blocked by a; a gets filtered out of the board view.
    const a = issueNode(1);
    const b = issueNode(2);
    const g = graph([a, b], [blocks(b, a)]);

    const result = run(g, DEFAULT_GRAPH_FACETS, allIds([b]));

    expect(result.nodes.map((n) => n.itemId)).toEqual(['item-2']);
    expect(result.edges).toEqual([]);
  });

  it('never drops a genuinely foreign node — it was never a candidate for the item filter', () => {
    const foreign = foreignNode(9);
    const b = issueNode(2);
    const g = graph([b, foreign], [blocks(b, foreign)]);

    // filteredItemIds names only b's own item id — the foreign node has none.
    const result = run(g, DEFAULT_GRAPH_FACETS, allIds([b]));

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });
});

describe('filterForgeGraph — showContains', () => {
  it('drops every contains edge when off, keeping both nodes', () => {
    const parent = issueNode(1);
    const child = issueNode(2);
    const g = graph([parent, child], [contains(parent, child)]);

    const result = run(g, { ...DEFAULT_GRAPH_FACETS, showContains: false }, allIds([parent, child]));

    expect(result.edges).toEqual([]);
    expect(result.nodes).toHaveLength(2);
  });

  it('keeps contains edges when on', () => {
    const parent = issueNode(1);
    const child = issueNode(2);
    const g = graph([parent, child], [contains(parent, child)]);

    const result = run(g, { ...DEFAULT_GRAPH_FACETS, showContains: true }, allIds([parent, child]));

    expect(result.edges).toHaveLength(1);
  });
});

describe('filterForgeGraph — only', () => {
  it('"blocked" keeps only blocked nodes and the edges between surviving nodes', () => {
    const a = issueNode(1); // not blocked
    const b = issueNode(2, { blocked: true, unmetBlockerCount: 1 });
    const g = graph([a, b], [blocks(b, a)]);

    const result = run(g, { ...DEFAULT_GRAPH_FACETS, only: 'blocked' }, allIds([a, b]));

    expect(result.nodes.map((n) => n.itemId)).toEqual(['item-2']);
    expect(result.edges).toEqual([]); // a (the blocker) is not itself blocked, so it drops too
  });

  it('"ready" keeps only ready nodes', () => {
    const a = issueNode(1, { ready: true });
    const b = issueNode(2, { blocked: true });
    const g = graph([a, b], [blocks(b, a)]);

    const result = run(g, { ...DEFAULT_GRAPH_FACETS, only: 'ready' }, allIds([a, b]));

    expect(result.nodes.map((n) => n.itemId)).toEqual(['item-1']);
  });
});

describe('filterForgeGraph — depth', () => {
  it('depth 1 keeps the selected node and its immediate blocks neighbours only', () => {
    // chain a <- b <- c (b depends on a, c depends on b)
    const a = issueNode(1);
    const b = issueNode(2);
    const c = issueNode(3);
    const g = graph([a, b, c], [blocks(b, a), blocks(c, b)]);

    const result = run(g, { ...DEFAULT_GRAPH_FACETS, depth: 1 }, allIds([a, b, c]), nodeKey(b));

    expect(new Set(result.nodes.map((n) => n.itemId))).toEqual(new Set(['item-1', 'item-2', 'item-3']));
  });

  it('depth 1 from the far end excludes the two-hop node', () => {
    const a = issueNode(1);
    const b = issueNode(2);
    const c = issueNode(3);
    const g = graph([a, b, c], [blocks(b, a), blocks(c, b)]);

    const result = run(g, { ...DEFAULT_GRAPH_FACETS, depth: 1 }, allIds([a, b, c]), nodeKey(c));

    expect(new Set(result.nodes.map((n) => n.itemId))).toEqual(new Set(['item-3', 'item-2']));
  });

  it('depth 2 reaches the two-hop node', () => {
    const a = issueNode(1);
    const b = issueNode(2);
    const c = issueNode(3);
    const g = graph([a, b, c], [blocks(b, a), blocks(c, b)]);

    const result = run(g, { ...DEFAULT_GRAPH_FACETS, depth: 2 }, allIds([a, b, c]), nodeKey(c));

    expect(new Set(result.nodes.map((n) => n.itemId))).toEqual(new Set(['item-1', 'item-2', 'item-3']));
  });

  it('is a no-op with no selection', () => {
    const a = issueNode(1);
    const b = issueNode(2);
    const c = issueNode(3);
    const g = graph([a, b, c], [blocks(b, a), blocks(c, b)]);

    const result = run(g, { ...DEFAULT_GRAPH_FACETS, depth: 2 }, allIds([a, b, c]), null);

    expect(result.nodes).toHaveLength(3);
  });

  it('never crosses a contains edge, even with showContains on', () => {
    const parent = issueNode(1);
    const child = issueNode(2);
    const unrelated = issueNode(3);
    const g = graph([parent, child, unrelated], [contains(parent, child)]);

    const result = run(
      g,
      { ...DEFAULT_GRAPH_FACETS, depth: 2, showContains: true },
      allIds([parent, child, unrelated]),
      nodeKey(parent),
    );

    expect(result.nodes.map((n) => n.itemId)).toEqual(['item-1']);
  });
});

describe('filterForgeGraph — hideIsolated', () => {
  it('drops a node left with no edge after the other facets ran, off by default', () => {
    const isolated = issueNode(1);
    const a = issueNode(2);
    const b = issueNode(3);
    const g = graph([isolated, a, b], [blocks(b, a)]);

    const withoutHide = run(g, DEFAULT_GRAPH_FACETS, allIds([isolated, a, b]));
    expect(withoutHide.nodes).toHaveLength(3);

    const withHide = run(g, { ...DEFAULT_GRAPH_FACETS, hideIsolated: true }, allIds([isolated, a, b]));
    expect(withHide.nodes.map((n) => n.itemId)).toEqual(expect.arrayContaining(['item-2', 'item-3']));
    expect(withHide.nodes).toHaveLength(2);
  });

  it('can leave zero nodes when the whole board has no edges — the caller renders its own zero-edge copy from the un-faceted graph, not this result', () => {
    const a = issueNode(1);
    const b = issueNode(2);
    const g = graph([a, b], []);

    const result = run(g, { ...DEFAULT_GRAPH_FACETS, hideIsolated: true }, allIds([a, b]));

    expect(result.nodes).toEqual([]);
  });
});
