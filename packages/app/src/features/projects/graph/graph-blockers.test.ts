import { resolveForgeGraph, type ForgeGraph, type ForgeGraphNode, type ForgeProjectItem } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { apiFieldBlockersFor } from './graph-blockers';

const node = (overrides: Partial<ForgeGraphNode> & Pick<ForgeGraphNode, 'itemId' | 'number'>): ForgeGraphNode => ({
  repo: '',
  title: '',
  kind: 'issue',
  state: 'open',
  blocked: false,
  ready: false,
  unmetBlockerCount: 0,
  foreign: false,
  truncated: false,
  ...overrides,
});

describe('apiFieldBlockersFor', () => {
  it('returns an api-sourced, still-open blocker', () => {
    const graph: ForgeGraph = {
      nodes: [
        node({ itemId: 'item1', number: 10 }),
        node({ itemId: '', number: 199, foreign: true }),
      ],
      edges: [{ from: '#10', to: '#199', kind: 'blocks', source: 'api' }],
      truncated: false,
      totalCount: 2,
      kind: 'ok',
    };

    expect(apiFieldBlockersFor(graph, 'item1')).toEqual([{ repo: '', number: 199 }]);
  });

  it('returns a field-sourced, still-open blocker', () => {
    const graph: ForgeGraph = {
      nodes: [
        node({ itemId: 'item1', number: 10 }),
        node({ itemId: '', number: 204, foreign: true }),
      ],
      edges: [{ from: '#10', to: '#204', kind: 'blocks', source: 'field' }],
      truncated: false,
      totalCount: 2,
      kind: 'ok',
    };

    expect(apiFieldBlockersFor(graph, 'item1')).toEqual([{ repo: '', number: 204 }]);
  });

  it('never returns a body-sourced blocker', () => {
    const graph: ForgeGraph = {
      nodes: [
        node({ itemId: 'item1', number: 10 }),
        node({ itemId: '', number: 204, foreign: true }),
      ],
      edges: [{ from: '#10', to: '#204', kind: 'blocks', source: 'body' }],
      truncated: false,
      totalCount: 2,
      kind: 'ok',
    };

    expect(apiFieldBlockersFor(graph, 'item1')).toEqual([]);
  });

  it('drops a blocker that is already closed — met, not unmet', () => {
    const graph: ForgeGraph = {
      nodes: [
        node({ itemId: 'item1', number: 10 }),
        node({ itemId: '', number: 199, foreign: true, state: 'closed' }),
      ],
      edges: [{ from: '#10', to: '#199', kind: 'blocks', source: 'api' }],
      truncated: false,
      totalCount: 2,
      kind: 'ok',
    };

    expect(apiFieldBlockersFor(graph, 'item1')).toEqual([]);
  });

  it('ignores a contains edge entirely', () => {
    const graph: ForgeGraph = {
      nodes: [
        node({ itemId: 'item1', number: 10 }),
        node({ itemId: '', number: 5, foreign: true }),
      ],
      edges: [{ from: '#5', to: '#10', kind: 'contains', source: 'api' }],
      truncated: false,
      totalCount: 2,
      kind: 'ok',
    };

    expect(apiFieldBlockersFor(graph, 'item1')).toEqual([]);
  });

  it('names a cross-repo blocker with its own repo', () => {
    const graph: ForgeGraph = {
      nodes: [
        node({ itemId: 'item1', number: 10 }),
        node({ itemId: '', number: 7, foreign: true, repo: 'acme/other' }),
      ],
      edges: [{ from: '#10', to: 'acme/other#7', kind: 'blocks', source: 'api' }],
      truncated: false,
      totalCount: 2,
      kind: 'ok',
    };

    expect(apiFieldBlockersFor(graph, 'item1')).toEqual([{ repo: 'acme/other', number: 7 }]);
  });

  it('returns an empty array for an item not on the graph', () => {
    const graph: ForgeGraph = { nodes: [], edges: [], truncated: false, totalCount: 0, kind: 'ok' };
    expect(apiFieldBlockersFor(graph, 'ghost')).toEqual([]);
  });

  it('end-to-end through resolveForgeGraph: api beats body, so the gate sees the api ref', () => {
    const items: ForgeProjectItem[] = [
      {
        id: 'item1',
        content: {
          type: 'issue',
          id: 'I_1',
          number: 10,
          title: 'Dependent',
          url: '',
          state: 'open',
          assignees: [],
          body: 'Blocked by #999',
          labels: [],
          dependencies: {
            blockedBy: [{ number: 199, title: 'Upstream', state: 'open', repo: '' }],
            parent: null,
            subIssues: [],
            blockedByTruncated: false,
            subIssuesTruncated: false,
          },
        },
        fieldValues: {},
      },
    ];

    const graph = resolveForgeGraph(items, [], { boardRepo: '' });
    expect(apiFieldBlockersFor(graph, 'item1')).toEqual([{ repo: '', number: 199 }]);
  });
});
