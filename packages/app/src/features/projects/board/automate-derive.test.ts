import type { ForgeGraph, ForgeGraphNode, ForgeProjectItem } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { findTodoColumn, nextUnblockedCard } from './automate-derive';
import type { BoardColumn } from './board-derive';

const draft = (id: string, title: string): ForgeProjectItem => ({
  id,
  content: { type: 'draft', id: `DI_${id}`, title, assignees: [], body: '' },
  fieldValues: {},
});

const node = (itemId: string, ready: boolean): ForgeGraphNode => ({
  itemId,
  number: null,
  repo: '',
  title: itemId,
  kind: 'draft',
  state: null,
  blocked: !ready,
  ready,
  unmetBlockerCount: ready ? 0 : 1,
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

  it('picks the first ready item in board order', () => {
    const graph = graphOf([node('a', false), node('b', true), node('c', true)]);
    expect(nextUnblockedCard(column, graph, new Set())?.id).toBe('b');
  });

  it('skips an excluded item even when it is ready', () => {
    const graph = graphOf([node('a', true), node('b', true)]);
    expect(nextUnblockedCard(column, graph, new Set(['a']))?.id).toBe('b');
  });

  it('treats a missing graph node as not ready', () => {
    const graph = graphOf([node('a', false)]);
    expect(nextUnblockedCard(column, graph, new Set())).toBeUndefined();
  });

  it('returns undefined once nothing unblocked remains', () => {
    const graph = graphOf([node('a', true), node('b', true), node('c', true)]);
    expect(nextUnblockedCard(column, graph, new Set(['a', 'b', 'c']))).toBeUndefined();
  });
});
