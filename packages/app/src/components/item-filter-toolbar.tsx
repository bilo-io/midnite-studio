import { LuCircleDot, LuTag, LuUsers } from 'react-icons/lu';
import { useMemo, type ReactNode } from 'react';

import { deriveAssigneeCounts, deriveLabelCounts, type FilterableItem, type ItemFilterState } from '../features/projects/filter';
import { FilterInput } from './filter-input';
import { MultiSelectMenu, type MultiSelectOption } from './multi-select-menu';

/** Most-used first, then alphabetical — same ordering `reviews-list.tsx`'s own author facet uses. */
function optionsFromCounts(counts: Map<string, number>): MultiSelectOption[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({
      value,
      label: value,
      meta: <span className="tabular-nums text-[10px] text-muted-foreground">{count}</span>,
    }));
}

/**
 * One filter toolbar over the shared facets (Phase 52 Theme A, lifted out of
 * `projects-view.tsx` in Phase 54 Theme E — that theme's own second
 * consumer, Issues, is what proved this was a pattern and not a one-off).
 *
 * Deliberately ignorant of anything a caller's own item shape carries beyond
 * `FilterableItem` — `select` is the one thing a caller supplies to make its
 * own type usable here. `types` and any other caller-specific facet (the
 * Projects view's own type filter and Board group-by picker) render as
 * `children`, appended after the shared controls in the same flex row,
 * rather than this component growing a second, caller-specific facet of its
 * own.
 */
export function ItemFilterToolbar<T>({
  items,
  select,
  filter,
  onFilterChange,
  stateOptions,
  children,
}: {
  items: readonly T[];
  select: (item: T) => FilterableItem;
  filter: ItemFilterState;
  onFilterChange: (filter: ItemFilterState) => void;
  /**
   * What "state" even means differs per caller — a pull request can be
   * merged, an issue never can — so this is the one facet whose options are
   * a prop rather than derived from data or hard-coded here.
   */
  stateOptions: readonly MultiSelectOption[];
  children?: ReactNode;
}) {
  const assigneeOptions = useMemo(() => optionsFromCounts(deriveAssigneeCounts(items, select)), [items, select]);
  const labelOptions = useMemo(() => optionsFromCounts(deriveLabelCounts(items, select)), [items, select]);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
      <FilterInput
        value={filter.query}
        onChange={(query) => onFilterChange({ ...filter, query })}
        placeholder="Search title, number or body…"
        className="w-56"
      />

      <MultiSelectMenu
        options={assigneeOptions}
        selected={filter.assignees}
        onChange={(assignees) => onFilterChange({ ...filter, assignees })}
        icon={<LuUsers aria-hidden className="h-3.5 w-3.5 shrink-0" />}
        allLabel="All assignees"
        searchPlaceholder="Filter assignees…"
        emptyLabel="No assignee matches."
        label="Filter by assignee"
        summarise={(n) => `${n} assignees`}
      />

      <MultiSelectMenu
        options={labelOptions}
        selected={filter.labels}
        onChange={(labels) => onFilterChange({ ...filter, labels })}
        icon={<LuTag aria-hidden className="h-3.5 w-3.5 shrink-0" />}
        allLabel="All labels"
        searchPlaceholder="Filter labels…"
        emptyLabel="No label matches."
        label="Filter by label"
        summarise={(n) => `${n} labels`}
      />

      <MultiSelectMenu
        options={stateOptions}
        selected={filter.states}
        onChange={(states) => onFilterChange({ ...filter, states: states as ItemFilterState['states'] })}
        icon={<LuCircleDot aria-hidden className="h-3.5 w-3.5 shrink-0" />}
        allLabel="All states"
        searchPlaceholder="Filter state…"
        emptyLabel="No state matches."
        label="Filter by state"
        summarise={(n) => `${n} states`}
      />

      {children}
    </div>
  );
}
