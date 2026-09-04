import type { ForgeProjectItem } from '@midnite/studio-shared';

/**
 * The structural shape `filterItems` and its two counters need — nothing
 * more (Phase 54 Theme E). Declared once so a second consumer's item type
 * only has to answer these five questions through a `select` function,
 * rather than share `ForgeProjectItem`'s own concrete shape. `number` and
 * `state` are nullable because a ProjectV2 draft has neither.
 */
export type FilterableItem = {
  title: string;
  number: number | null;
  body?: string;
  assignees: readonly string[];
  labels: readonly string[];
  state: 'open' | 'closed' | 'merged' | null;
};

/**
 * The shared filter facets (Phase 52 Theme A, generalised in Phase 54 Theme
 * E) — every facet `FilterableItem` can answer. `types` is deliberately not
 * here: it is ProjectV2-specific (`content.type === 'draft'` means nothing
 * for an issue), so it stays a facet `ProjectItemFilterState` layers on top,
 * below, rather than dead weight every future caller carries and never uses.
 */
export type ItemFilterState = {
  /** Matched against title, item number and body. */
  query: string;
  assignees: readonly string[];
  labels: readonly string[];
  states: readonly ('open' | 'closed' | 'merged')[];
};

export const EMPTY_ITEM_FILTER: ItemFilterState = {
  query: '',
  assignees: [],
  labels: [],
  states: [],
};

export function isItemFilterEmpty(filter: ItemFilterState): boolean {
  return (
    filter.query.trim().length === 0 &&
    filter.assignees.length === 0 &&
    filter.labels.length === 0 &&
    filter.states.length === 0
  );
}

/**
 * Every facet is AND'd against the others; within one facet, any match is
 * enough (OR). Pure so the trickiest case — an item with no `state` at all —
 * is a unit test rather than something only visible by opening a view: such
 * an item is excluded outright by a non-empty `states` facet, the same way
 * it would exclude an item whose actual state simply isn't selected.
 *
 * Generic over `T` rather than constraining `T extends FilterableItem`
 * directly — corrected from the doc's own draft phrasing once actually
 * written: `ForgeProjectItem`'s filterable fields live under `.content`, a
 * discriminated union, not at the item's own top level, so there is no flat
 * shape for `T` to structurally satisfy without a caller reshaping its whole
 * array first. A `select` accessor reaches into whatever `T` actually is
 * instead, which is what "a generic here is a type parameter, not an
 * abstraction layer" means in practice: `T` carries no shape at all.
 */
export function filterItems<T>(
  items: readonly T[],
  filter: ItemFilterState,
  select: (item: T) => FilterableItem,
): T[] {
  if (isItemFilterEmpty(filter)) return items.slice();

  const needle = filter.query.trim().toLowerCase();

  return items.filter((item) => {
    const f = select(item);

    if (filter.states.length > 0) {
      if (f.state === null || !filter.states.includes(f.state)) return false;
    }

    if (filter.assignees.length > 0 && !f.assignees.some((a) => filter.assignees.includes(a))) {
      return false;
    }

    if (filter.labels.length > 0 && !f.labels.some((l) => filter.labels.includes(l))) {
      return false;
    }

    if (needle.length > 0) {
      const numberText = f.number === null ? '' : String(f.number);
      const haystack = `${f.title} ${numberText} ${f.body ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

/** Distinct assignee logins across the given items, most-used first. */
export function deriveAssigneeCounts<T>(
  items: readonly T[],
  select: (item: T) => Pick<FilterableItem, 'assignees'>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const login of select(item).assignees) counts.set(login, (counts.get(login) ?? 0) + 1);
  }
  return counts;
}

/** Distinct label names across the given items (an item with none contributes none), most-used first. */
export function deriveLabelCounts<T>(
  items: readonly T[],
  select: (item: T) => Pick<FilterableItem, 'labels'>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const label of select(item).labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

/*
 * ─── The Projects view's own filter (Phase 52 Theme A) ─────────────────────
 *
 * `ProjectItemFilterState` extends the shared facets with `types`, and
 * `filterProjectItems` below is what `projects-view.tsx` actually calls for
 * filtering — a thin ProjectV2-specific layer over the generic primitive
 * above, so nothing outside this file needs to know `ForgeProjectItem.content`
 * is a discriminated union. `selectProjectItem` is exported on its own too:
 * `deriveAssigneeCounts`/`deriveLabelCounts` take it directly rather than
 * through a second pair of Projects-specific wrappers — see
 * `item-filter-toolbar.tsx`'s own `select` prop.
 */

export type ProjectItemFilterState = ItemFilterState & {
  types: readonly ForgeProjectItem['content']['type'][];
};

export const EMPTY_PROJECT_ITEM_FILTER: ProjectItemFilterState = {
  ...EMPTY_ITEM_FILTER,
  types: [],
};

export function isProjectItemFilterEmpty(filter: ProjectItemFilterState): boolean {
  return filter.types.length === 0 && isItemFilterEmpty(filter);
}

/** A draft has no number, labels or state — `filterItems`' `null`/`[]` cases exist for exactly this. */
export function selectProjectItem(item: ForgeProjectItem): FilterableItem {
  const content = item.content;
  return {
    title: content.title,
    number: content.type === 'draft' ? null : content.number,
    body: content.body,
    assignees: content.assignees,
    labels: content.type === 'draft' ? [] : content.labels,
    state: content.type === 'draft' ? null : content.state,
  };
}

/**
 * `types` first, since it is not a question the generic primitive above can
 * even ask — then the shared facets over whatever survives.
 */
export function filterProjectItems(
  items: readonly ForgeProjectItem[],
  filter: ProjectItemFilterState,
): ForgeProjectItem[] {
  const typed =
    filter.types.length === 0 ? items : items.filter((item) => filter.types.includes(item.content.type));
  return filterItems(typed, filter, selectProjectItem);
}
