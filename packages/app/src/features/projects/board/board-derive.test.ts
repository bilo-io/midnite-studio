import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { deriveColumns, NO_STATUS_COLUMN_ID } from './board-derive';

const statusField: ForgeProjectField = {
  id: 'f1',
  name: 'Status',
  dataType: 'single_select',
  options: [
    { id: 'todo', name: 'Todo', color: 'GRAY' },
    { id: 'doing', name: 'In Progress', color: 'YELLOW' },
    { id: 'done', name: 'Done', color: 'GREEN' },
  ],
};

const draft = (id: string, title: string): ForgeProjectItem => ({
  id,
  content: { type: 'draft', id: `DI_${id}`, title, assignees: [] },
  fieldValues: {},
});

const withStatus = (id: string, title: string, optionId: string, name: string): ForgeProjectItem => ({
  id,
  content: { type: 'draft', id: `DI_${id}`, title, assignees: [] },
  fieldValues: { f1: { fieldId: 'f1', dataType: 'single_select', optionId, name } },
});

describe('deriveColumns', () => {
  it('returns no columns for a missing field', () => {
    expect(deriveColumns(null, [draft('i1', 'a')])).toEqual([]);
    expect(deriveColumns(undefined, [draft('i1', 'a')])).toEqual([]);
  });

  it('returns no columns for a field that is not single_select', () => {
    const textField: ForgeProjectField = { id: 'f2', name: 'Notes', dataType: 'text' };
    expect(deriveColumns(textField, [draft('i1', 'a')])).toEqual([]);
  });

  it('orders columns as No status, then the field\'s own option order', () => {
    const columns = deriveColumns(statusField, []);
    expect(columns.map((c) => c.id)).toEqual([NO_STATUS_COLUMN_ID, 'todo', 'doing', 'done']);
    expect(columns.map((c) => c.name)).toEqual(['No status', 'Todo', 'In Progress', 'Done']);
  });

  it('carries the option colour onto its column, and none for No status', () => {
    const columns = deriveColumns(statusField, []);
    expect(columns.find((c) => c.id === 'todo')?.color).toBe('GRAY');
    expect(columns.find((c) => c.id === NO_STATUS_COLUMN_ID)?.color).toBe('');
  });

  it('an item with no Status value goes to No status, not the first real column', () => {
    const columns = deriveColumns(statusField, [draft('i1', 'a')]);
    expect(columns.find((c) => c.id === NO_STATUS_COLUMN_ID)?.items).toHaveLength(1);
    expect(columns.find((c) => c.id === 'todo')?.items).toHaveLength(0);
  });

  it('an item whose option id no longer exists on the field goes to No status, not dropped', () => {
    const columns = deriveColumns(statusField, [withStatus('i1', 'a', 'deleted-option', 'Old Name')]);
    expect(columns.find((c) => c.id === NO_STATUS_COLUMN_ID)?.items.map((i) => i.id)).toEqual(['i1']);
  });

  it('sorts items into their matching column by option id', () => {
    const items = [
      withStatus('i1', 'a', 'todo', 'Todo'),
      withStatus('i2', 'b', 'done', 'Done'),
      withStatus('i3', 'c', 'todo', 'Todo'),
    ];
    const columns = deriveColumns(statusField, items);
    expect(columns.find((c) => c.id === 'todo')?.items.map((i) => i.id)).toEqual(['i1', 'i3']);
    expect(columns.find((c) => c.id === 'done')?.items.map((i) => i.id)).toEqual(['i2']);
    expect(columns.find((c) => c.id === 'doing')?.items).toHaveLength(0);
  });

  it('a field with no items still produces every column, empty', () => {
    const columns = deriveColumns(statusField, []);
    expect(columns.every((c) => c.items.length === 0)).toBe(true);
    expect(columns).toHaveLength(4);
  });
});
