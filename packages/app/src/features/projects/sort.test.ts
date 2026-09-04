import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { nextSortState, sortItems } from './sort';

const item = (id: string, fieldValues: ForgeProjectItem['fieldValues'] = {}): ForgeProjectItem => ({
  id,
  content: { type: 'draft', id: `DI_${id}`, title: id, assignees: [], body: '' },
  fieldValues,
});

describe('nextSortState', () => {
  it('cycles asc → desc → none on the same column', () => {
    let state = nextSortState(null, 'f1');
    expect(state).toEqual({ fieldId: 'f1', direction: 'asc' });
    state = nextSortState(state, 'f1');
    expect(state).toEqual({ fieldId: 'f1', direction: 'desc' });
    state = nextSortState(state, 'f1');
    expect(state).toBeNull();
    state = nextSortState(state, 'f1');
    expect(state).toEqual({ fieldId: 'f1', direction: 'asc' });
  });

  it('clicking a different column starts that column fresh at asc', () => {
    const onF1 = { fieldId: 'f1', direction: 'desc' as const };
    expect(nextSortState(onF1, 'f2')).toEqual({ fieldId: 'f2', direction: 'asc' });
  });
});

describe('sortItems', () => {
  it('returns items unchanged (API order) for a null sort', () => {
    const items = [item('c'), item('a'), item('b')];
    expect(sortItems(items, [], null)).toEqual(items);
  });

  it('returns items unchanged when the sorted field no longer exists', () => {
    const items = [item('a'), item('b')];
    expect(sortItems(items, [], { fieldId: 'gone', direction: 'asc' })).toEqual(items);
  });

  it('sorts text lexically', () => {
    const field: ForgeProjectField = { id: 'f1', name: 'Notes', dataType: 'text' };
    const items = [
      item('a', { f1: { fieldId: 'f1', dataType: 'text', text: 'zebra' } }),
      item('b', { f1: { fieldId: 'f1', dataType: 'text', text: 'apple' } }),
    ];
    expect(sortItems(items, [field], { fieldId: 'f1', direction: 'asc' }).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('sorts numbers numerically, not lexically', () => {
    const field: ForgeProjectField = { id: 'f1', name: 'Points', dataType: 'number' };
    const items = [
      item('a', { f1: { fieldId: 'f1', dataType: 'number', number: 10 } }),
      item('b', { f1: { fieldId: 'f1', dataType: 'number', number: 2 } }),
    ];
    expect(sortItems(items, [field], { fieldId: 'f1', direction: 'asc' }).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('sorts dates chronologically', () => {
    const field: ForgeProjectField = { id: 'f1', name: 'Due', dataType: 'date' };
    const items = [
      item('a', { f1: { fieldId: 'f1', dataType: 'date', date: '2024-12-01' } }),
      item('b', { f1: { fieldId: 'f1', dataType: 'date', date: '2024-01-01' } }),
    ];
    expect(sortItems(items, [field], { fieldId: 'f1', direction: 'asc' }).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('sorts single_select by option order, not alphabetically', () => {
    const field: ForgeProjectField = {
      id: 'f1',
      name: 'Status',
      dataType: 'single_select',
      options: [
        { id: 'todo', name: 'Todo', color: '' },
        { id: 'doing', name: 'In Progress', color: '' },
        { id: 'done', name: 'Done', color: '' },
      ],
    };
    const items = [
      item('a', { f1: { fieldId: 'f1', dataType: 'single_select', optionId: 'done', name: 'Done' } }),
      item('b', { f1: { fieldId: 'f1', dataType: 'single_select', optionId: 'todo', name: 'Todo' } }),
      item('c', { f1: { fieldId: 'f1', dataType: 'single_select', optionId: 'doing', name: 'In Progress' } }),
    ];
    // Option order (Todo, In Progress, Done) would be scrambled by an
    // alphabetical sort (Done, In Progress, Todo) — this proves it isn't one.
    expect(sortItems(items, [field], { fieldId: 'f1', direction: 'asc' }).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts iteration by title, honestly — the schema carries no start date', () => {
    const field: ForgeProjectField = { id: 'f1', name: 'Sprint', dataType: 'iteration' };
    const items = [
      item('a', { f1: { fieldId: 'f1', dataType: 'iteration', iterationId: 'x', title: 'Sprint 2' } }),
      item('b', { f1: { fieldId: 'f1', dataType: 'iteration', iterationId: 'y', title: 'Sprint 1' } }),
    ];
    expect(sortItems(items, [field], { fieldId: 'f1', direction: 'asc' }).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('items with no value sort last ascending', () => {
    const field: ForgeProjectField = { id: 'f1', name: 'Points', dataType: 'number' };
    const items = [
      item('none'),
      item('has', { f1: { fieldId: 'f1', dataType: 'number', number: 5 } }),
    ];
    expect(sortItems(items, [field], { fieldId: 'f1', direction: 'asc' }).map((i) => i.id)).toEqual(['has', 'none']);
  });

  it('items with no value still sort last descending — reversing direction does not promote them', () => {
    const field: ForgeProjectField = { id: 'f1', name: 'Points', dataType: 'number' };
    const items = [
      item('none'),
      item('has', { f1: { fieldId: 'f1', dataType: 'number', number: 5 } }),
    ];
    expect(sortItems(items, [field], { fieldId: 'f1', direction: 'desc' }).map((i) => i.id)).toEqual(['has', 'none']);
  });

  it('an unresolvable single_select option id sorts last, like no value', () => {
    const field: ForgeProjectField = {
      id: 'f1',
      name: 'Status',
      dataType: 'single_select',
      options: [{ id: 'todo', name: 'Todo', color: '' }],
    };
    const items = [
      item('deleted', { f1: { fieldId: 'f1', dataType: 'single_select', optionId: 'gone', name: 'Old' } }),
      item('real', { f1: { fieldId: 'f1', dataType: 'single_select', optionId: 'todo', name: 'Todo' } }),
    ];
    expect(sortItems(items, [field], { fieldId: 'f1', direction: 'asc' }).map((i) => i.id)).toEqual(['real', 'deleted']);
  });
});
