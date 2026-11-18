import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

/**
 * The `Status` single-select field's own option id — every real column keys
 * on this. `NO_STATUS_COLUMN_ID` never collides with a real one: GraphQL node
 * ids are opaque base64-ish strings, never `__no_status__`.
 */
export const NO_STATUS_COLUMN_ID = '__no_status__';

export type BoardColumn = {
  id: string;
  name: string;
  /** The option's own colour, empty for the synthetic "No status" column. */
  color: string;
  items: readonly ForgeProjectItem[];
};

/**
 * A board's columns, from its grouping field and its items (Phase 41 Theme A,
 * generalised to any `single_select` or `iteration` field by Phase 52 Theme
 * B — the board's own `Status`-only grouping being exactly what that theme
 * reverses).
 *
 * **Pure and exported** so option order, a missing field and an orphaned
 * option id are each a unit test, not a mounted component — the phase doc's
 * own acceptance requirement. A leading "No `<field name>`" column carries
 * two cases that read identically to a user: an item with no value for the
 * field at all, and (for `single_select`) one whose value points at an option
 * the board no longer has (deleted or renamed on github.com since the item
 * was set — see `ForgeProjectFieldValueSchema`'s own note on why a
 * `single_select` value is not cross-checked against today's option list).
 * Neither is dropped, and neither is invented into the first real column.
 */
export function deriveColumns(
  field: ForgeProjectField | null | undefined,
  items: readonly ForgeProjectItem[],
): BoardColumn[] {
  if (!field) return [];
  if (field.dataType === 'single_select') return deriveSingleSelectColumns(field, items);
  if (field.dataType === 'iteration') return deriveIterationColumns(field, items);
  return [];
}

function deriveSingleSelectColumns(
  field: Extract<ForgeProjectField, { dataType: 'single_select' }>,
  items: readonly ForgeProjectItem[],
): BoardColumn[] {
  const columns = new Map<string, BoardColumn>();
  columns.set(NO_STATUS_COLUMN_ID, { id: NO_STATUS_COLUMN_ID, name: `No ${field.name}`, color: '', items: [] });
  for (const option of field.options) {
    columns.set(option.id, { id: option.id, name: option.name, color: option.color, items: [] });
  }

  // Mutated in place, then frozen into the returned `items` arrays below —
  // simplest way to bucket in one pass without rebuilding each column's array
  // per item.
  const buckets = new Map<string, ForgeProjectItem[]>();
  for (const column of columns.values()) buckets.set(column.id, []);

  for (const item of items) {
    const value = item.fieldValues[field.id];
    const columnId =
      value?.dataType === 'single_select' && columns.has(value.optionId) ? value.optionId : NO_STATUS_COLUMN_ID;
    buckets.get(columnId)!.push(item);
  }

  return Array.from(columns.values()).map((column) => ({ ...column, items: buckets.get(column.id)! }));
}

/**
 * An iteration field carries no enumerable option list the way `single_select`
 * does (`ForgeProjectFieldSchema`'s `iteration` member is identity-only) —
 * its columns are discovered from the items themselves, in first-seen order,
 * which is also why grouping by iteration is read-only: there is no fixed
 * option set a drop could target that isn't itself derived from who is
 * already in it.
 */
function deriveIterationColumns(
  field: Extract<ForgeProjectField, { dataType: 'iteration' }>,
  items: readonly ForgeProjectItem[],
): BoardColumn[] {
  const columns = new Map<string, BoardColumn>();
  columns.set(NO_STATUS_COLUMN_ID, { id: NO_STATUS_COLUMN_ID, name: `No ${field.name}`, color: '', items: [] });
  const buckets = new Map<string, ForgeProjectItem[]>();
  buckets.set(NO_STATUS_COLUMN_ID, []);

  for (const item of items) {
    const value = item.fieldValues[field.id];
    if (value?.dataType === 'iteration') {
      if (!columns.has(value.iterationId)) {
        columns.set(value.iterationId, { id: value.iterationId, name: value.title || value.iterationId, color: '', items: [] });
        buckets.set(value.iterationId, []);
      }
      buckets.get(value.iterationId)!.push(item);
    } else {
      buckets.get(NO_STATUS_COLUMN_ID)!.push(item);
    }
  }

  return Array.from(columns.values()).map((column) => ({ ...column, items: buckets.get(column.id)! }));
}
