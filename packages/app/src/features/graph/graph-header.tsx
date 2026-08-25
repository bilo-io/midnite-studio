import type { Ref } from '@midnite/git-shared';

import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable, type Resizable } from '../../components/resizable/use-resizable';
import {
  DEFAULT_GRAPH_COLUMNS,
  GRAPH_COLUMN_BOUNDS,
  useUiStore,
  type GraphColumns,
} from '../../store/ui-store';
import { AuthorFilter, type AuthorSummary } from './author-filter';
import type { GraphTheme } from './graph-themes';
import { RefFilter } from './ref-filter';

export type GraphColumnResizables = Record<keyof GraphColumns, Resizable>;

/**
 * The live width of each column — the drag value while dragging, else the
 * persisted one.
 *
 * Owned by `GraphView` rather than by the header so that ONE value feeds both
 * the header labels and the rows. Split across the two, the header would track
 * the pointer while the rows lagged on the last committed width, and the table
 * would visibly come apart mid-drag.
 */
export function useGraphColumns(): GraphColumnResizables {
  const columns = useUiStore((s) => s.graphColumns);
  const setColumn = useUiStore((s) => s.setGraphColumn);

  const common = (name: keyof GraphColumns, edge: 'start' | 'end') => ({
    size: columns[name],
    onSize: (value: number) => setColumn(name, value),
    initial: DEFAULT_GRAPH_COLUMNS[name],
    axis: 'x' as const,
    edge,
    ...GRAPH_COLUMN_BOUNDS[name],
  });

  // Three fixed hook calls, not a map: the rules of hooks forbid deriving the
  // count from data, and there is exactly one shape of this table.
  return {
    // BRANCH / TAG is the leading column, so its handle is on its RIGHT and a
    // rightward drag grows it — the opposite of the trailing pair.
    branchTag: useResizable(common('branchTag', 'start')),
    date: useResizable(common('date', 'end')),
    sha: useResizable(common('sha', 'end')),
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
    '--col-branch-tag': `${columns.branchTag.current}px`,
    '--col-date': `${columns.date.current}px`,
    '--col-sha': `${columns.sha.current}px`,
  }) as React.CSSProperties;

/** The graph table's header: the two filters, then the column labels. */
export function GraphHeader({
  refs,
  authors,
  gutterWidth,
  columns,
  theme,
}: {
  refs: readonly Ref[];
  authors: readonly AuthorSummary[];
  /** Matches the lane gutter, so "Graph" sits over the lanes it names. */
  gutterWidth: number;
  columns: GraphColumnResizables;
  theme: GraphTheme;
}) {
  const graphRefFilter = useUiStore((s) => s.graphRefFilter);
  const setGraphRefFilter = useUiStore((s) => s.setGraphRefFilter);
  const graphAuthorFilter = useUiStore((s) => s.graphAuthorFilter);
  const setGraphAuthorFilter = useUiStore((s) => s.setGraphAuthorFilter);

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <RefFilter refs={refs} selected={graphRefFilter} onChange={setGraphRefFilter} />
        <AuthorFilter
          authors={authors}
          selected={graphAuthorFilter}
          onChange={setGraphAuthorFilter}
        />
        <span className="ml-auto text-[11px] text-muted-foreground">{theme.label}</span>
      </div>

      <div
        role="row"
        className="flex items-stretch gap-2 border-t border-border/60 pr-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        <span
          role="columnheader"
          className="shrink-0 py-1 pl-2"
          style={{ width: columns.branchTag.current }}
        >
          Branch / Tag
        </span>
        <ResizeHandle resizable={columns.branchTag} axis="x" label="Resize branch and tag column" />

        {/*
          Clipped, because the gutter is sized by the history — a shallow repo
          gives it two lanes (32px), which the word "Graph" overflows straight
          into the next header, rendering as "GRAPHCOMMIT MESSAGE".
        */}
        <span
          role="columnheader"
          className="shrink-0 overflow-hidden truncate py-1"
          style={{ width: gutterWidth }}
        >
          Graph
        </span>
        <span role="columnheader" className="min-w-0 flex-1 py-1">
          Commit message
        </span>

        <ResizableColumn label="Date" resizable={columns.date} />
        <ResizableColumn label="SHA" resizable={columns.sha} />
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
