import type { ForgeProjectField } from '@midnite/studio-shared';

/**
 * Which field the board groups by (Phase 52 Theme B) — replaces
 * `board-view.tsx`'s old `findStatusField`, which matched the literal string
 * `Status` and nothing else.
 *
 * `preferredId` is the persisted choice (per project). It degrades
 * predictably rather than to an `EmptyState`: a field deleted from the
 * project since it was chosen falls through to the same default a project
 * that never had a choice made gets — a field named `Status` when one
 * exists, so today's behaviour stays the default rather than a special case,
 * and otherwise the first groupable field on the project.
 */
export function resolveGroupField(
  fields: readonly ForgeProjectField[],
  preferredId: string | null,
): ForgeProjectField | null {
  if (preferredId !== null) {
    const preferred = fields.find((f) => f.id === preferredId && isGroupable(f));
    if (preferred) return preferred;
  }

  const status = fields.find((f) => f.dataType === 'single_select' && f.name === 'Status');
  if (status) return status;

  return fields.find(isGroupable) ?? null;
}

function isGroupable(field: ForgeProjectField): boolean {
  return field.dataType === 'single_select' || field.dataType === 'iteration';
}

/** Every field a board can group by, for the toolbar's picker. */
export function groupableFields(fields: readonly ForgeProjectField[]): ForgeProjectField[] {
  return fields.filter(isGroupable);
}
