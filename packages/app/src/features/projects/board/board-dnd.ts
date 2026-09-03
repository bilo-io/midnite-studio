import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import { NO_STATUS_COLUMN_ID } from './board-derive';

/** What a dragged card carries, and what a column drop target answers to. */
export type CardDragPayload = { kind: 'card'; itemId: string };
export type ColumnDropPayload = { kind: 'column'; optionId: string };

/**
 * The optimistic move (Phase 41 Theme C) — a pure reducer over the board's
 * own item list, so a test exercises it and its rollback without a DOM.
 *
 * `toColumnId === NO_STATUS_COLUMN_ID` **clears** the field rather than
 * no-opping (Phase 50 Theme C) — `board-view.tsx`'s `useDroppable` no longer
 * disables that column now that `clearProjectV2ItemFieldValue` exists to
 * back the drop with a real mutation. Every other case is unchanged.
 */
export function applyOptimisticMove(
  items: readonly ForgeProjectItem[],
  itemId: string,
  statusField: ForgeProjectField,
  toColumnId: string,
): ForgeProjectItem[] {
  if (statusField.dataType !== 'single_select') return items.slice();

  if (toColumnId === NO_STATUS_COLUMN_ID) {
    return items.map((item) => {
      if (item.id !== itemId) return item;
      const fieldValues = { ...item.fieldValues };
      delete fieldValues[statusField.id];
      return { ...item, fieldValues };
    });
  }

  const option = statusField.options.find((o) => o.id === toColumnId);
  if (!option) return items.slice();

  return items.map((item) => {
    if (item.id !== itemId) return item;
    return {
      ...item,
      fieldValues: {
        ...item.fieldValues,
        [statusField.id]: {
          fieldId: statusField.id,
          dataType: 'single_select',
          optionId: option.id,
          name: option.name,
        },
      },
    };
  });
}
