import type { ForgeGraph, ForgeGraphNode, ForgeProjectItem, WorkflowRun } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { findTodoColumn, nextUnblockedCard, workflowRunNeedsAttention } from './automate-derive';
import type { BoardColumn } from './board-derive';

const draft = (id: string, title: string): ForgeProjectItem => ({
  id,
  content: { type: 'draft', id: `DI_${id}`, title, assignees: [], body: '' },
  fieldValues: {},
});

/**
 * `ready` here deliberately follows `resolveForgeGraph`'s own narrow
 * definition ("had a blocker, now closed") rather than mirroring `blocked` —
 * a node that never had a blocker at all is `blocked: false, ready: false`,
 * and `workable('a')` below is the fixture for exactly that common case.
 */
const node = (itemId: string, workable: boolean, opts: { everHadBlocker?: boolean } = {}): ForgeGraphNode => ({
  itemId,
  number: null,
  repo: '',
  title: itemId,
  kind: 'draft',
  state: 'open',
  blocked: !workable,
  ready: workable && (opts.everHadBlocker ?? false),
  unmetBlockerCount: workable ? 0 : 1,
  foreign: false,
  truncated: false,
});

const graphOf = (nodes: ForgeGraphNode[]): ForgeGraph => ({
  nodes,
  edges: [],
  truncated: false,
  totalCount: nodes.length,
  kind: 'ok',
});

describe('findTodoColumn', () => {
  it('matches a column named "Todo" case-insensitively', () => {
    const columns: BoardColumn[] = [
      { id: 'c1', name: 'Backlog', color: '', items: [] },
      { id: 'c2', name: 'todo', color: '', items: [] },
    ];
    expect(findTodoColumn(columns)?.id).toBe('c2');
  });

  it('returns undefined when no column is named Todo', () => {
    const columns: BoardColumn[] = [{ id: 'c1', name: 'Backlog', color: '', items: [] }];
    expect(findTodoColumn(columns)).toBeUndefined();
  });
});

describe('nextUnblockedCard', () => {
  const column: BoardColumn = {
    id: 'todo',
    name: 'Todo',
    color: '',
    items: [draft('a', 'A'), draft('b', 'B'), draft('c', 'C')],
  };

  it('picks the first workable item in board order', () => {
    const graph = graphOf([node('a', false), node('b', true), node('c', true)]);
    expect(nextUnblockedCard(column, graph, new Set())?.id).toBe('b');
  });

  it('a card that never had a blocker is workable despite reading `ready: false`', () => {
    // `everHadBlocker` defaults false — this is `resolveForgeGraph`'s own
    // shape for the overwhelmingly common "no dependencies at all" card.
    const graph = graphOf([node('a', true)]);
    expect(graph.nodes[0]!.ready).toBe(false);
    expect(nextUnblockedCard(column, graph, new Set())?.id).toBe('a');
  });

  it('skips an excluded item even when it is workable', () => {
    const graph = graphOf([node('a', true), node('b', true)]);
    expect(nextUnblockedCard(column, graph, new Set(['a']))?.id).toBe('b');
  });

  it('treats a missing graph node as blocked', () => {
    const graph = graphOf([node('a', false)]);
    expect(nextUnblockedCard(column, graph, new Set())).toBeUndefined();
  });

  it('returns undefined once nothing unblocked remains', () => {
    const graph = graphOf([node('a', true), node('b', true), node('c', true)]);
    expect(nextUnblockedCard(column, graph, new Set(['a', 'b', 'c']))).toBeUndefined();
  });
});

describe('workflowRunNeedsAttention (Phase 97 Theme D)', () => {
  const run = (overrides: Partial<Pick<WorkflowRun, 'status' | 'nodes'>>): Pick<WorkflowRun, 'status' | 'nodes'> => ({
    status: 'running',
    nodes: [],
    ...overrides,
  });

  it('is true for a running run with a gate waiting', () => {
    expect(
      workflowRunNeedsAttention(
        run({
          nodes: [
            { nodeId: 'g', kind: 'gate', label: 'Gate', status: 'waiting', truncated: false, gatedDownstream: false },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('is false once the run has finished, even if a node still reads waiting in stale history', () => {
    expect(
      workflowRunNeedsAttention(
        run({
          status: 'completed',
          nodes: [
            { nodeId: 'g', kind: 'gate', label: 'Gate', status: 'waiting', truncated: false, gatedDownstream: false },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('is false for an ordinary running run with nothing waiting', () => {
    expect(
      workflowRunNeedsAttention(
        run({
          nodes: [
            { nodeId: 'h', kind: 'http', label: 'HTTP', status: 'running', truncated: false, gatedDownstream: false },
          ],
        }),
      ),
    ).toBe(false);
  });
});
