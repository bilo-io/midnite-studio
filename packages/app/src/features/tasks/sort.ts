import type { ForgeProjectField, ForgeProjectFieldValue, ForgeProjectItem } from '@midnite/studio-shared';

/**
 * The table's sort state (Phase 52 Theme C) — tri-state per column: ascending
 * → descending → `null` (the project's own API order, not some other sort).
 * A two-state toggle would make that original order unreachable once you had
 * sorted once, which is why `null` is a real member here rather than "not
 * sorting yet".
 */
export type SortDirection = 'asc' | 'desc';
export type SortState = { fieldId: string; direction: SortDirection } | null;

/** asc → desc → none → asc, per column. */
export function nextSortState(current: SortState, fieldId: string): SortState {
  if (!current || current.fieldId !== fieldId) return { fieldId, direction: 'asc' };
  if (current.direction === 'asc') return { fieldId, direction: 'desc' };
  return null;
}

/**
 * One comparator per `dataType` — **option order for `single_select`, not
 * alphabetical**: "Todo, In Progress, Done" carries meaning that alphabetising
 * destroys. An option id no longer on the field (deleted/renamed since the
 * item was set, same case `board-derive.ts` handles) has no resolvable order
 * and is treated as no value at all, sorting last exactly like one.
 *
 * **Correction, iteration:** the phase doc calls for "start-date for
 * iteration", but `ForgeProjectFieldValueSchema`'s iteration member carries no
 * start date at all — `{iterationId, title}` only — and this phase adds no
 * schema field to invent one (a hard guardrail: "no schema change… a diff
 * touching them means a theme drifted"). Sorted by `title` instead, the only
 * per-value text GitHub actually sends; recorded here rather than silently
 * shipped as "alphabetical was close enough".
 */
function compareValues(
  field: ForgeProjectField,
  a: ForgeProjectFieldValue,
  b: ForgeProjectFieldValue,
): number {
  switch (field.dataType) {
    case 'text':
      return a.dataType === 'text' && b.dataType === 'text' ? a.text.localeCompare(b.text) : 0;
    case 'number':
      return a.dataType === 'number' && b.dataType === 'number' ? a.number - b.number : 0;
    case 'date':
      // GitHub's date-only `YYYY-MM-DD` string sorts lexically in exactly
      // chronological order — no `Date` parsing, no timezone ambiguity.
      return a.dataType === 'date' && b.dataType === 'date' ? a.date.localeCompare(b.date) : 0;
    case 'single_select':
      if (a.dataType !== 'single_select' || b.dataType !== 'single_select') return 0;
      return optionIndex(field, a.optionId) - optionIndex(field, b.optionId);
    case 'iteration':
      return a.dataType === 'iteration' && b.dataType === 'iteration' ? a.title.localeCompare(b.title) : 0;
  }
}

function optionIndex(field: Extract<ForgeProjectField, { dataType: 'single_select' }>, optionId: string): number {
  return field.options.findIndex((o) => o.id === optionId);
}

/** Whether a value can actually be ordered — an unresolvable `single_select`
 *  option id is treated as no value, the same as never having been set. */
function hasOrderableValue(field: ForgeProjectField, value: ForgeProjectFieldValue | undefined): boolean {
  if (value === undefined) return false;
  if (field.dataType === 'single_select' && value.dataType === 'single_select') {
    return optionIndex(field, value.optionId) !== -1;
  }
  return true;
}

/**
 * Sort items by one field, composing with whatever filter already ran (the
 * caller sorts the already-filtered array). `null` sort returns the items
 * unchanged, restoring the project's own API order. Items with no orderable
 * value for the sorted field sort **last in both directions** — absent is not
 * "smallest", and reversing direction must not migrate it to the top.
 */
export function sortItems(
  items: readonly ForgeProjectItem[],
  fields: readonly ForgeProjectField[],
  sort: SortState,
): ForgeProjectItem[] {
  if (!sort) return items.slice();
  const field = fields.find((f) => f.id === sort.fieldId);
  if (!field) return items.slice();

  const direction = sort.direction === 'asc' ? 1 : -1;

  return items
    .map((item, index) => ({ item, index, value: item.fieldValues[field.id] }))
    .sort((a, b) => {
      const aHas = hasOrderableValue(field, a.value);
      const bHas = hasOrderableValue(field, b.value);
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (!aHas || !bHas) return a.index - b.index; // stable among the valueless
      return direction * compareValues(field, a.value!, b.value!) || a.index - b.index;
    })
    .map((entry) => entry.item);
}
