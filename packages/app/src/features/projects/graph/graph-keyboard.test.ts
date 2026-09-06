import { describe, expect, it } from 'vitest';

import type { ForgeGraph, ForgeGraphEdge, ForgeGraphNode } from '@midnite/studio-shared';

import { moveAlongEdge, moveWithinRank } from './graph-keyboard';
import { layoutForgeGraph } from './graph-layout';

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

const key = (node: ForgeGraphNode): string => `${node.repo}#${node.number}`;

function blocks(from: ForgeGraphNode, to: ForgeGraphNode): ForgeGraphEdge {
  return { from: key(from), to: key(to), kind: 'blocks', source: 'api' };
}

function graph(nodes: ForgeGraphNode[], edges: ForgeGraphEdge[]): ForgeGraph {
  return { nodes, edges, truncated: false, totalCount: nodes.length, kind: 'ok' };
}

describe('moveAlongEdge', () => {
  // A diamond: d depends on b and c; b and c both depend on a.
  //
  //      b
  //    ↗   ↘
  //  a       d
  //    ↘   ↗
  //      c
  const a = issueNode(1);
  const b = issueNode(2);
  const c = issueNode(3);
  const d = issueNode(4);
  const { nodes, edges } = layoutForgeGraph(graph([a, b, c, d], [blocks(b, a), blocks(c, a), blocks(d, b), blocks(d, c)]));

  it('left from the sink goes to its nearest blocker, deterministically', () => {
    // b and c are both rank 1 (tied) — the tie breaks on key, same every run.
    const left = moveAlongEdge(nodes, edges, key(d), 'left');
    expect(left).toBe(moveAlongEdge(nodes, edges, key(d), 'left'));
    expect([key(b), key(c)]).toContain(left);
  });

  it('right from the source goes to its nearest dependent, deterministically', () => {
    const right = moveAlongEdge(nodes, edges, key(a), 'right');
    expect(right).toBe(moveAlongEdge(nodes, edges, key(a), 'right'));
    expect([key(b), key(c)]).toContain(right);
  });

  it('returns null left at a source (no blockers)', () => {
    expect(moveAlongEdge(nodes, edges, key(a), 'left')).toBeNull();
  });

  it('returns null right at a sink (nothing depends on it)', () => {
    expect(moveAlongEdge(nodes, edges, key(d), 'right')).toBeNull();
  });

  it('returns null for a key with no edges at all', () => {
    expect(moveAlongEdge(nodes, edges, 'nonexistent', 'left')).toBeNull();
  });
});

describe('moveWithinRank', () => {
  const a = issueNode(1);
  const b = issueNode(2);
  const c = issueNode(3);
  const d = issueNode(4);
  const { nodes } = layoutForgeGraph(graph([a, b, c, d], [blocks(b, a), blocks(c, a), blocks(d, b), blocks(d, c)]));

  it('moves down to the next sibling in the same rank', () => {
    const bKey = key(b);
    const cKey = key(c);
    const siblingsSameRank = nodes.filter((n) => n.rank === nodes.find((x) => x.key === bKey)!.rank);
    expect(siblingsSameRank.length).toBe(2);

    const down = moveWithinRank(nodes, bKey, 1);
    expect(down).not.toBe(bKey); // never itself
    expect([bKey, cKey]).toContain(down);
  });

  it('wraps at either end of the rank', () => {
    const bKey = key(b);
    const down1 = moveWithinRank(nodes, bKey, 1)!;
    const down2 = moveWithinRank(nodes, down1, 1)!;
    expect(down2).toBe(bKey); // two-sibling rank: down twice returns to start
  });

  it('returns null for a rank with only one node', () => {
    expect(moveWithinRank(nodes, key(a), 1)).toBeNull();
    expect(moveWithinRank(nodes, key(d), -1)).toBeNull();
  });

  it('returns null for an unknown key', () => {
    expect(moveWithinRank(nodes, 'nonexistent', 1)).toBeNull();
  });
});
