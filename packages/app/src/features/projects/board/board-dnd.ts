import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import { NO_STATUS_COLUMN_ID } from './board-derive';

/** What a dragged card carries, and what a column drop target answers to. */
export type CardDragPayload = { kind: 'card'; itemId: string };
export type ColumnDropPayload = { kind: 'column'; optionId: string };

/**
 * The optimistic move (Phase 41 Theme C) — a pure reducer over the board's
 * own item list, so a test exercises it and its rollback without a DOM.
 *
 * A no-op (returns `items` unchanged) for the one case a caller must not let
 * through: `toColumnId === NO_STATUS_COLUMN_ID`. There is no
 * `clearProjectV2ItemFieldValue` in this phase's write path — Phase 40 Theme
 * E built only `updateProjectV2ItemFieldValue`, which requires a real option
 * id — so "No status" is not a droppable column at all (see `board-view.tsx`'s
 * `disabled` on that column's `useDroppable`). This function stays defensive
 * about it anyway: a reducer that trusted its caller to never pass the one
 * value it cannot honour is a reducer one future call site will get wrong.
 */
export function applyOptimisticMove(
  items: readonly ForgeProjectItem[],
  itemId: string,
  statusField: ForgeProjectField,
  toColumnId: string,
): ForgeProjectItem[] {
  if (statusField.dataType !== 'single_select' || toColumnId === NO_STATUS_COLUMN_ID) {
    return items.slice();
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
