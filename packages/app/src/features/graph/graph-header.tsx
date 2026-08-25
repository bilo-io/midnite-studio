import type { Ref } from '@midnite/git-shared';

import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable, type Resizable } from '../../components/resizable/use-resizable';
import {
  DEFAULT_GRAPH_COLUMNS,
  GRAPH_COLUMN_BOUNDS,
  useUiStore,
  type GraphColumns,
} from '../../store/ui-store';
import { RefFilter } from './ref-filter';

/** The trailing, resizable columns, in render order. */
export const GRAPH_COLUMNS: { name: keyof GraphColumns; label: string }[] = [
  { name: 'author', label: 'Author' },
  { name: 'date', label: 'Date' },
  { name: 'sha', label: 'SHA' },
];

export type GraphColumnResizables = Record<keyof GraphColumns, Resizable>;

/**
 * The live width of each column — the drag value while dragging, else the
 * persisted one.
 *
 * Owned by `GraphView` rather than by the header so that ONE value feeds both
 * the header labels and the rows. Split across the two, the header would track
 * the pointer while the rows lagged on the last committed width, and the table
 * would visibly come apart mid-drag.
 *
 * The handles sit on each column's LEFT and the columns are right-aligned, so
 * dragging left widens them — `edge: 'end'`, the same inversion the
 * right-docked panes need.
 */
export function useGraphColumns(): GraphColumnResizables {
  const columns = useUiStore((s) => s.graphColumns);
  const setColumn = useUiStore((s) => s.setGraphColumn);

  const common = (name: keyof GraphColumns) => ({
    size: columns[name],
    onSize: (value: number) => setColumn(name, value),
    initial: DEFAULT_GRAPH_COLUMNS[name],
    axis: 'x' as const,
    edge: 'end' as const,
    ...GRAPH_COLUMN_BOUNDS[name],
  });

  // Three fixed hook calls, not a map: the rules of hooks forbid deriving the
  // count from data, and there is exactly one shape of this table.
  return {
    author: useResizable(common('author')),
    date: useResizable(common('date')),
    sha: useResizable(common('sha')),
  };
}

/**
 * Column widths as custom properties for the element wrapping the rows.
 *
 * `CommitGraphRow` is memoised precisely because a streaming log re-renders the
 * list on every 500-row batch — around a hundred times for a large repo.
 * Threading a width through props would bust that memo on every pointermove of
 * a drag, forcing every visible row through React at 60Hz. A custom property on
 * an ancestor repaints without React touching the rows at all.
 */
export const graphColumnVars = (columns: GraphColumnResizables): React.CSSProperties =>
  ({
    '--col-author': `${columns.author.current}px`,
    '--col-date': `${columns.date.current}px`,
    '--col-sha': `${columns.sha.current}px`,
  }) as React.CSSProperties;

/** The graph table's header: a branch filter, then the column labels. */
export function GraphHeader({
  refs,
  gutterWidth,
  columns,
}: {
  refs: readonly Ref[];
  /** Matches the lane gutter, so "Graph" sits over the lanes it names. */
  gutterWidth: number;
  columns: GraphColumnResizables;
}) {
  const graphRefFilter = useUiStore((s) => s.graphRefFilter);
  const setGraphRefFilter = useUiStore((s) => s.setGraphRefFilter);

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <RefFilter refs={refs} selected={graphRefFilter} onChange={setGraphRefFilter} />
      </div>

      <div
        role="row"
        className="flex items-stretch gap-2 border-t border-border/60 pr-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        <span role="columnheader" className="shrink-0 py-1 pl-2" style={{ width: gutterWidth }}>
          Graph
        </span>
        <span role="columnheader" className="min-w-0 flex-1 py-1">
          Commit
        </span>

        {GRAPH_COLUMNS.map(({ name, label }) => (
          <ResizableColumn key={name} label={label} resizable={columns[name]} />
        ))}
      </div>
    </div>
  );
}

function ResizableColumn({ label, resizable }: { label: string; resizable: Resizable }) {
  return (
    <>
      <ResizeHandle resizable={resizable} axis="x" label={`Resize ${label} column`} />
      <span
        role="columnheader"
        className="shrink-0 py-1 text-right"
        style={{ width: resizable.current }}
      >
        {label}
      </span>
    </>
  );
}
