// Pure helpers behind the Tasks screens (Phase 146 Theme H). Nothing here touches React or the network, so each is a
// plain unit test.
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

/** Columns are `min(88% of the screen, 340dp)` wide so the next one peeks (H2). */
export function columnWidth(screenWidth: number): number {
  return Math.round(Math.min(screenWidth * 0.88, 340));
}

/** The width one board page snaps by: the column plus the gap between columns. */
export function columnSnapInterval(screenWidth: number, gap: number): number {
  return columnWidth(screenWidth) + gap;
}

/** Which column the scroll offset has paged to (0-based), clamped to the column count. */
export function pageIndex(offsetX: number, interval: number, count: number): number {
  if (count <= 0 || interval <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(offsetX / interval)));
}

export const itemNumber = (item: ForgeProjectItem): number | null =>
  item.content.type === 'draft' ? null : item.content.number;

export const itemLabels = (item: ForgeProjectItem): readonly string[] =>
  item.content.type === 'draft' ? [] : item.content.labels;

/** "#12", or "Draft" for a board draft that has no number. */
export const itemRef = (item: ForgeProjectItem): string => {
  const n = itemNumber(item);
  return n === null ? 'Draft' : `#${n}`;
};

/** Only a single-select grouping can be written to (an iteration's columns are derived from the items, read-only). */
export function movableField(field: ForgeProjectField | null): Extract<ForgeProjectField, { dataType: 'single_select' }> | null {
  return field && field.dataType === 'single_select' ? field : null;
}

/** The item with its value in `field` replaced by `optionId` (a new object; the input is untouched). */
export function withOptionValue(
  item: ForgeProjectItem,
  field: Extract<ForgeProjectField, { dataType: 'single_select' }>,
  optionId: string,
): ForgeProjectItem {
  const option = field.options.find((o) => o.id === optionId);
  return {
    ...item,
    fieldValues: {
      ...item.fieldValues,
      [field.id]: { fieldId: field.id, dataType: 'single_select', optionId, name: option?.name ?? '' },
    },
  };
}

/** Apply optimistic moves (`itemId` → `optionId`) over the loaded items. */
export function applyMoves(
  items: readonly ForgeProjectItem[],
  field: ForgeProjectField | null,
  moves: ReadonlyMap<string, string>,
): ForgeProjectItem[] {
  const single = movableField(field);
  if (!single || moves.size === 0) return items.slice();
  return items.map((item) => {
    const optionId = moves.get(item.id);
    return optionId === undefined ? item : withOptionValue(item, single, optionId);
  });
}

/** The option id an item currently holds in a single-select field, or null. */
export function currentOptionId(item: ForgeProjectItem, field: ForgeProjectField): string | null {
  const value = item.fieldValues[field.id];
  return value?.dataType === 'single_select' ? value.optionId : null;
}

/** Next-page auto-loading: the board and list need every item, so keep paging until the last page. */
export const needsMorePages = (hasNextPage: boolean, isFetching: boolean): boolean => hasNextPage && !isFetching;

export type TasksView = 'board' | 'list' | 'graph';
export const VIEW_SEGMENTS: readonly { key: TasksView; label: string }[] = [
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
  { key: 'graph', label: 'Graph' },
];

export const isTasksView = (v: string): v is TasksView => v === 'board' || v === 'list' || v === 'graph';

/** A GitHub label colour ("d73a4a", no hash) as a CSS colour; empty falls back to the caller's neutral. */
export const labelHex = (color: string): string | undefined => (color ? `#${color.replace(/^#/, '')}` : undefined);
