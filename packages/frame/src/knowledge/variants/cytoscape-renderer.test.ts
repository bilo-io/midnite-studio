// Layer: vitest/jsdom — cytoscape's class and position bookkeeping with a stubbed 2D context. Real pixels are the human/visual check.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { defaultFilterState } from '../knowledge-filters';
import { CytoscapeRenderer } from './cytoscape-renderer';

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

type Internals = { nodeEles: Map<string, { classes(): string[]; position(): { x: number; y: number } }> };

describe('CytoscapeRenderer', () => {
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
    const renderer = new CytoscapeRenderer({ prefersReducedMotion: () => true, colorFor: () => 'rgb(1, 2, 3)' });
    renderer.mount(container, payload, { onNodeClick: () => {}, onNodeDoubleClick: () => {} }, { maxNodes: Infinity });
    return { renderer, eles: (renderer as unknown as Internals).nodeEles };
  }

  it('puts every node on the canvas at its worker position', () => {
    const { renderer, eles } = mount();
    expect([...eles.keys()]).toEqual(['a', 'b', 'c']);
    expect(eles.get('b')!.position()).toEqual({ x: 50, y: 0 });
    renderer.dispose();
  });

  it('maps the Theme C alpha states onto stylesheet classes', () => {
    const { renderer, eles } = mount();
    renderer.applyFilters({ ...defaultFilterState(), relations: new Set(['calls']) });
    renderer.applyHighlight('a');
    expect(eles.get('a')!.classes()).toEqual(expect.arrayContaining(['focus', 'selected']));
    expect(eles.get('b')!.classes()).toContain('neighbor');
    expect(eles.get('c')!.classes()).toContain('dim');
    renderer.applyHighlight(null);
    expect(eles.get('c')!.classes()).not.toContain('dim');
    renderer.dispose();
  });

  it('hides a community the filter switches off', () => {
    const { renderer, eles } = mount();
    renderer.applyFilters({ ...defaultFilterState(), relations: new Set(['calls']), hiddenCommunities: new Set(['two']) });
    expect(eles.get('c')!.classes()).toContain('hidden');
    expect(eles.get('a')!.classes()).not.toContain('hidden');
    renderer.dispose();
  });

  it('folds a collapsed community into one meta-node', () => {
    const { renderer } = mount();
    renderer.setCollapsed(new Set(['one']));
    const eles = (renderer as unknown as Internals).nodeEles;
    expect(eles.size).toBe(2);
    expect(eles.has('a')).toBe(false);
    renderer.dispose();
  });
});
