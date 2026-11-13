// Layer: vitest — pure model and paint maths, no canvas.
import { describe, expect, it } from 'vitest';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { defaultFilterState } from '../knowledge-filters';
import { buildModel2D, computePaint2D, straightAlpha } from './knowledge-2d-model';
import { DEFAULT_NODE_ALPHA, DIMMED_ALPHA, NEIGHBOR_NODE_ALPHA } from '../knowledge-canvas-colors';

const payload: KnowledgeGraphPayload = {
  nodes: [
    { id: 'a', label: 'Alpha', community: 0, communityName: 'one', fileType: 'code' },
    { id: 'b', label: 'Beta', community: 0, communityName: 'one', fileType: 'code' },
    { id: 'c', label: 'Gamma', community: 1, communityName: 'two', fileType: 'code' },
    { id: 'd', label: 'Delta', community: 1, communityName: 'two', fileType: 'code' },
  ],
  links: [
    { source: 'a', target: 'b', relation: 'calls', weight: 1, confidence: 1 },
    { source: 'b', target: 'c', relation: 'calls', weight: 0.5, confidence: 1 },
    { source: 'c', target: 'd', relation: 'imports', weight: 1, confidence: 1 },
  ],
  positions: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, c: { x: 20, y: 0 }, d: { x: 30, y: 0 } },
  builtAtCommit: 'x',
  cached: false,
  commitsBehind: null,
} as unknown as KnowledgeGraphPayload;

const colorFor = (community: number) => `rgb(${community}, 0, 0)`;
const build = (over: Partial<Parameters<typeof buildModel2D>[1]> = {}) =>
  buildModel2D(payload, { maxNodes: Infinity, collapsedCommunities: new Set(), colorFor, ...over });

describe('buildModel2D', () => {
  it('mounts every node at its laid-out position, coloured by its community', () => {
    const model = build();
    expect(model.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(model.nodeById.get('c')).toMatchObject({ x: 20, y: 0, color: 'rgb(1, 0, 0)' });
    expect(model.links).toHaveLength(3);
  });

  it('puts the centroid at the mean of the mounted nodes, not the origin', () => {
    expect(build().centroid).toEqual({ x: 15, y: 0 });
  });

  it('respects the detail budget: top-degree nodes only, links among them', () => {
    const model = build({ maxNodes: 2 });
    expect(model.nodes.map((n) => n.id).sort()).toEqual(['b', 'c']);
    expect(model.links.map((l) => `${l.source}${l.target}`)).toEqual(['bc']);
  });

  it('folds a collapsed community into a meta-node with aggregated edges', () => {
    const model = build({ collapsedCommunities: new Set(['one']) });
    const meta = model.nodes.find((n) => n.kind === 'community')!;
    expect(meta).toMatchObject({ memberCount: 2, communityName: 'one', x: 5 });
    expect(model.nodes.map((n) => n.id)).not.toContain('a');
    const aggregated = model.links.filter((l) => l.aggregated);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]!.target).toBe('c');
  });

  it('builds undirected one-hop neighbours', () => {
    expect([...build().neighbours.get('b')!].sort()).toEqual(['a', 'c']);
  });
});

describe('computePaint2D', () => {
  const filters = { ...defaultFilterState(), relations: new Set(['calls', 'imports']) };

  it('paints everything at the rest alpha when nothing is focused', () => {
    const paint = computePaint2D(build(), filters, null);
    expect([...paint.nodeAlpha.values()].every((a) => a === DEFAULT_NODE_ALPHA)).toBe(true);
    expect(paint.linkEmphasised.size).toBe(0);
  });

  it('runs the Theme C model: focus 1, neighbour lit, the rest dimmed', () => {
    const paint = computePaint2D(build(), filters, 'a');
    expect(paint.nodeAlpha.get('a')).toBe(1);
    expect(paint.nodeAlpha.get('b')).toBe(NEIGHBOR_NODE_ALPHA);
    expect(paint.nodeAlpha.get('c')).toBe(DIMMED_ALPHA);
    expect([...paint.linkEmphasised]).toEqual(['e0']);
  });

  it('applies relation and community filters to links and nodes', () => {
    const paint = computePaint2D(
      build(),
      { ...filters, relations: new Set(['calls']), hiddenCommunities: new Set(['two']) },
      null,
    );
    expect(paint.linkVisible.get('e0')).toBe(true);
    expect(paint.linkVisible.get('e1')).toBe(false);
    expect(paint.linkVisible.get('e2')).toBe(false);
    expect(paint.nodeVisible.get('c')).toBe(false);
    expect(paint.nodeVisible.get('a')).toBe(true);
  });

  it('treats a search match as a focus node', () => {
    const paint = computePaint2D(build(), { ...filters, query: 'gam' }, null);
    expect(paint.nodeAlpha.get('c')).toBe(1);
    expect(paint.nodeAlpha.get('a')).toBe(DIMMED_ALPHA);
  });
});

describe('straightAlpha', () => {
  it('does not premultiply — canvas blends straight alpha', () => {
    expect(straightAlpha('rgb(200, 100, 50)', 0.5)).toBe('rgba(200, 100, 50, 0.5)');
  });
  it('passes a non-rgb colour through untouched', () => {
    expect(straightAlpha('#fff', 0.5)).toBe('#fff');
  });
});
