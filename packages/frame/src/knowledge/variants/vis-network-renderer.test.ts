// Layer: vitest/jsdom — vis-network's data-set bookkeeping with a stubbed 2D context. Real pixels are the human/visual check.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { defaultFilterState } from '../knowledge-filters';
import { VisNetworkRenderer } from './vis-network-renderer';

const payload = {
  nodes: [
    { id: 'a', label: 'A', community: 0, communityName: 'one', fileType: 'code' },
    { id: 'b', label: 'B', community: 0, communityName: 'one', fileType: 'code' },
    { id: 'c', label: 'C', community: 1, communityName: 'two', fileType: 'code' },
  ],
  links: [
    { source: 'a', target: 'b', relation: 'calls', weight: 1, confidence: 1 },
    { source: 'b', target: 'c', relation: 'calls', weight: 1, confidence: 1 },
  ],
  positions: { a: { x: 0, y: 0 }, b: { x: 50, y: 0 }, c: { x: 100, y: 0 } },
  builtAtCommit: 'x',
  cached: false,
  commitsBehind: null,
} as unknown as KnowledgeGraphPayload;

type DataSetLike = { get(id: string): Record<string, unknown> | null; length: number };
type Internals = { nodes: DataSetLike; edges: DataSetLike };

describe('VisNetworkRenderer', () => {
  beforeAll(() => {
    const ctx = new Proxy({}, { get: () => () => ({ width: 1 }), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => vi.clearAllMocks());

  function mount() {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 400 });
    Object.defineProperty(container, 'clientHeight', { value: 300 });
    document.body.appendChild(container);
    const renderer = new VisNetworkRenderer({ prefersReducedMotion: () => true, colorFor: () => 'rgb(1, 2, 3)' });
    renderer.mount(container, payload, { onNodeClick: () => {}, onNodeDoubleClick: () => {} }, { maxNodes: Infinity });
    return { renderer, data: renderer as unknown as Internals };
  }

  it('hands vis-network every node and edge at the worker positions', () => {
    const { renderer, data } = mount();
    expect(data.nodes.length).toBe(3);
    expect(data.edges.length).toBe(2);
    expect(data.nodes.get('b')).toMatchObject({ x: 50, y: 0, fixed: true });
    renderer.dispose();
  });

  it('maps the Theme C alpha states onto node opacity', () => {
    const { renderer, data } = mount();
    renderer.applyFilters({ ...defaultFilterState(), relations: new Set(['calls']) });
    renderer.applyHighlight('a');
    expect(data.nodes.get('a')).toMatchObject({ opacity: 1, borderWidth: 2, label: 'A' });
    expect(data.nodes.get('b')).toMatchObject({ opacity: 0.85 });
    expect(data.nodes.get('c')).toMatchObject({ opacity: 0.1 });
    renderer.dispose();
  });

  it('hides a community the filter switches off, and the edges into it', () => {
    const { renderer, data } = mount();
    renderer.applyFilters({ ...defaultFilterState(), relations: new Set(['calls']), hiddenCommunities: new Set(['two']) });
    expect(data.nodes.get('c')).toMatchObject({ hidden: true });
    expect(data.edges.get('e1')).toMatchObject({ hidden: true });
    expect(data.edges.get('e0')).toMatchObject({ hidden: false });
    renderer.dispose();
  });

  it('folds a collapsed community into one meta-node', () => {
    const { renderer, data } = mount();
    renderer.setCollapsed(new Set(['one']));
    expect(data.nodes.length).toBe(2);
    expect(data.nodes.get('a')).toBeNull();
    renderer.dispose();
  });
});
