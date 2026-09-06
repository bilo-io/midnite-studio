import { describe, expect, it } from 'vitest';

import type { ForgeGraphEdge, ForgeGraphNode } from '@midnite/studio-shared';

import { edgeAppearance } from './edge-appearance';

function node(overrides: Partial<ForgeGraphNode> = {}): ForgeGraphNode {
  return {
    itemId: 'item-1',
    number: 1,
    repo: '',
    title: 'Issue',
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

const BLOCKS: ForgeGraphEdge = { from: 'dependent', to: 'blocker', kind: 'blocks', source: 'api' };
const CONTAINS: ForgeGraphEdge = { from: 'parent', to: 'child', kind: 'contains', source: 'api' };

describe('edgeAppearance', () => {
  it('closed blocker, closed dependent — solid dep-done at 2.5px', () => {
    const blocker = node({ state: 'closed' });
    const dependent = node({ state: 'closed' });
    const appearance = edgeAppearance(BLOCKS, blocker, dependent);
    expect(appearance.className).toBe('dep-edge dep-edge-done');
    expect(appearance.className).not.toContain('dep-edge-animated');
    expect(appearance.strokeWidth).toBe(2.5);
  });

  it('closed blocker, ready dependent — animated dep-done with bloom', () => {
    const blocker = node({ state: 'closed' });
    const dependent = node({ state: 'open', ready: true });
    const appearance = edgeAppearance(BLOCKS, blocker, dependent);
    expect(appearance.className).toContain('dep-edge-done');
    expect(appearance.className).toContain('dep-edge-animated');
    expect(appearance.className).toContain('dep-edge-bloom');
    expect(appearance.strokeWidth).toBe(2);
  });

  it('closed blocker, still-blocked dependent — animated dep-done, no bloom', () => {
    const blocker = node({ state: 'closed' });
    const dependent = node({ state: 'open', blocked: true, ready: false });
    const appearance = edgeAppearance(BLOCKS, blocker, dependent);
    expect(appearance.className).toContain('dep-edge-done');
    expect(appearance.className).toContain('dep-edge-animated');
    expect(appearance.className).not.toContain('dep-edge-bloom');
    expect(appearance.strokeWidth).toBe(2);
  });

  it('open blocker with an agent running, blocked dependent — animated dep-active', () => {
    const blocker = node({ state: 'open' });
    const dependent = node({ state: 'open', blocked: true });
    expect(edgeAppearance(BLOCKS, blocker, dependent, 'running').className).toBe(
      'dep-edge dep-edge-active dep-edge-animated',
    );
    expect(edgeAppearance(BLOCKS, blocker, dependent, 'waiting').className).toBe(
      'dep-edge dep-edge-active dep-edge-animated',
    );
  });

  it('open blocker with no agent running — static dep-idle at 1.5px', () => {
    const blocker = node({ state: 'open' });
    const dependent = node({ state: 'open', blocked: true });
    const appearance = edgeAppearance(BLOCKS, blocker, dependent, 'idle');
    expect(appearance.className).toBe('dep-edge dep-edge-idle');
    expect(appearance.strokeWidth).toBe(1.5);
  });

  it('open blocker, agent running, but dependent not blocked — falls through to idle', () => {
    const blocker = node({ state: 'open' });
    const dependent = node({ state: 'open', blocked: false });
    expect(edgeAppearance(BLOCKS, blocker, dependent, 'running').className).toBe('dep-edge dep-edge-idle');
  });

  it('a foreign blocker with no known state — idle, never done or active', () => {
    const blocker = node({ state: null, foreign: true, itemId: '' });
    const dependent = node({ state: 'open', blocked: true });
    expect(edgeAppearance(BLOCKS, blocker, dependent, 'running').className).toBe('dep-edge dep-edge-idle');
  });

  it('contains edges are always the same quiet, static appearance', () => {
    const parent = node({ state: 'closed' });
    const child = node({ state: 'open', blocked: true });
    const appearance = edgeAppearance(CONTAINS, parent, child, 'running');
    expect(appearance.className).toBe('dep-edge dep-edge-contains');
    expect(appearance.strokeWidth).toBe(1.5);
  });

  it('a body-sourced edge appends the dotted/low-confidence modifier on top of its state', () => {
    const bodyEdge: ForgeGraphEdge = { ...BLOCKS, source: 'body' };
    const blocker = node({ state: 'closed' });
    const dependent = node({ state: 'closed' });
    const appearance = edgeAppearance(bodyEdge, blocker, dependent);
    expect(appearance.className).toBe('dep-edge dep-edge-done dep-edge-body');
  });
});
