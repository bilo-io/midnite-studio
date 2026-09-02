import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { applyOptimisticMove } from './board-dnd';
import { NO_STATUS_COLUMN_ID } from './board-derive';

const STATUS_FIELD: ForgeProjectField = {
  id: 'f-status',
  name: 'Status',
  dataType: 'single_select',
  options: [
    { id: 'opt-todo', name: 'Todo', color: 'GRAY' },
    { id: 'opt-done', name: 'Done', color: 'GREEN' },
  ],
};

const item = (overrides: Partial<ForgeProjectItem> = {}): ForgeProjectItem => ({
  id: 'item-1',
  content: { type: 'draft', id: 'DI_1', title: 'A card', assignees: [] },
  fieldValues: {},
  ...overrides,
});

describe('applyOptimisticMove', () => {
  it('sets the target column’s option id and name on the moved item', () => {
    const items = [item()];
    const next = applyOptimisticMove(items, 'item-1', STATUS_FIELD, 'opt-done');

    expect(next[0]?.fieldValues['f-status']).toEqual({
      fieldId: 'f-status',
      dataType: 'single_select',
      optionId: 'opt-done',
      name: 'Done',
    });
  });

  it('leaves every other item untouched', () => {
    const other = item({ id: 'item-2' });
    const items = [item(), other];
    const next = applyOptimisticMove(items, 'item-1', STATUS_FIELD, 'opt-done');

    expect(next.find((i) => i.id === 'item-2')).toBe(other);
  });

  it('overwrites an existing value for the same field', () => {
    const items = [
      item({
        fieldValues: {
          'f-status': { fieldId: 'f-status', dataType: 'single_select', optionId: 'opt-todo', name: 'Todo' },
        },
      }),
    ];
    const next = applyOptimisticMove(items, 'item-1', STATUS_FIELD, 'opt-done');

    expect(next[0]?.fieldValues['f-status']).toMatchObject({ optionId: 'opt-done' });
  });

  it('is a no-op — never clears the field — when the target is the No-status column', () => {
    const items = [
      item({
        fieldValues: {
          'f-status': { fieldId: 'f-status', dataType: 'single_select', optionId: 'opt-todo', name: 'Todo' },
        },
      }),
    ];
    const next = applyOptimisticMove(items, 'item-1', STATUS_FIELD, NO_STATUS_COLUMN_ID);

    expect(next[0]?.fieldValues['f-status']).toMatchObject({ optionId: 'opt-todo' });
  });

  it('is a no-op for an option id the field no longer has', () => {
    const items = [item()];
    const next = applyOptimisticMove(items, 'item-1', STATUS_FIELD, 'opt-deleted');

    expect(next[0]?.fieldValues['f-status']).toBeUndefined();
  });

  it('is a no-op for a non-single_select field', () => {
    const textField: ForgeProjectField = { id: 'f-text', name: 'Notes', dataType: 'text' };
    const items = [item()];
    const next = applyOptimisticMove(items, 'item-1', textField, 'opt-done');

    expect(next).toEqual(items);
  });

  it('leaves the original array untouched (returns a new one)', () => {
    const items = [item()];
    const next = applyOptimisticMove(items, 'item-1', STATUS_FIELD, 'opt-done');

    expect(next).not.toBe(items);
    expect(items[0]?.fieldValues['f-status']).toBeUndefined();
  });
});
