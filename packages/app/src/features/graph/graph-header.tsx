import type { Ref } from '@midnite/studio-shared';

import { PageDetachMark } from '../../components/page-detach-mark';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable, type Resizable } from '../../components/resizable/use-resizable';
import {
  DEFAULT_GRAPH_COLUMNS,
  GRAPH_COLUMN_BOUNDS,
  useUiStore,
  type GraphColumns,
} from '../../store/ui-store';
import { AuthorFilter, type AuthorSummary } from './author-filter';
import { RAIL_WIDTH, showsAuthorColumn, type GraphTheme } from './graph-themes';
import { RefFilter } from './ref-filter';

export type GraphColumnResizables = Record<keyof GraphColumns, Resizable>;

/**
 * The `gap-2` both the header row and every commit row are laid out with, in px.
 *
 * Written down because the header has resize handles between its cells and the
 * rows do not, so the handles have to be told to collapse into this gap rather
 * than add to it — otherwise the two lay out on different grids and every
 * header label drifts right of the column it names. See `ResizeHandle`'s `gap`.
 */
const HEADER_GAP = 8;

/**
 * The live width of each column — the drag value while dragging, else the
 * persisted one.
 *
 * Owned by `GraphView` rather than by the header so that ONE value feeds both
 * the header labels and the rows. Split across the two, the header would track
 * the pointer while the rows lagged on the last committed width, and the table
 * would visibly come apart mid-drag.
 */
export function useGraphColumns(gutter: GutterBounds): GraphColumnResizables {
  const columns = useUiStore((s) => s.graphColumns);
  const setColumn = useUiStore((s) => s.setGraphColumn);

  // Every column but the gutter, whose bounds are geometry rather than a
  // constant pair and so arrive as an argument.
  const common = (name: keyof typeof GRAPH_COLUMN_BOUNDS, edge: 'start' | 'end') => ({
    size: columns[name],
    onSize: (value: number) => setColumn(name, value),
    initial: DEFAULT_GRAPH_COLUMNS[name],
    axis: 'x' as const,
    edge,
    ...GRAPH_COLUMN_BOUNDS[name],
  });

  // Five fixed hook calls, not a map: the rules of hooks forbid deriving the
  // count from data. Author is sized here even in the styles that do not render
  // it — a hook cannot be called conditionally, and a width for a hidden column
  // costs nothing but keeps its size when you switch back to a style that has
  // one.
  return {
    // BRANCH / TAG is the leading column, so its handle is on its RIGHT and a
    // rightward drag grows it — the opposite of the trailing group.
    branchTag: useResizable(common('branchTag', 'start')),
    /**
     * The gutter's bounds are the only ones that are not constants: both ends
     * are geometry — the natural fit of this history in this style, and the
     * point past which its lanes would stop being separable. See `GutterBounds`.
     *
     * `initial` is the natural fit, so double-clicking the handle means "size
     * the graph to the history" rather than "restore some remembered number".
     */
    graph: useResizable({
      size: columns.graph,
      onSize: (value: number) => setColumn('graph', value),
      initial: gutter.max,
      axis: 'x' as const,
      edge: 'start' as const,
      min: gutter.min,
      max: gutter.max,
    }),
    author: useResizable(common('author', 'end')),
    date: useResizable(common('date', 'end')),
    sha: useResizable(common('sha', 'end')),
  };
}

/**
 * What the gutter may be dragged between, in px.
 *
 * `max` is the natural fit — `lanes * theme.laneWidth`, the width the gutter
 * has always been — so the handle only ever takes width AWAY. Padding the
 * column past what the lanes need would be empty space with a graph floating in
 * it, which is not a size anybody drags towards.
 *
 * `min` is where the lanes have closed to half a node. Below that they stop
 * being separable lines; at exactly that point a single-lane history is one
 * node wide, which is the floor the whole idea bottoms out on.
 */
export type GutterBounds = { min: number; max: number };

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
    '--col-author': `${columns.author.current}px`,
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
  /**
   * The gutter's painted width — `columns.graph.current` rounded through the
   * same geometry the rows use, not the raw drag value. The header has to name
   * the lanes it sits over to the pixel, and the two diverge whenever a
   * requested width does not divide evenly into lanes.
   */
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
      <div className="flex items-center gap-2 px-2 py-1.5">
        <PageDetachMark role="graph" />
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
        <ResizeHandle
          resizable={columns.branchTag}
          axis="x"
          gap={HEADER_GAP}
          label="Resize branch and tag column"
        />

        {/*
          Clipped, because the gutter is sized by the history and by the drag —
          a shallow repo gives it two lanes (32px), which the word "Graph"
          overflows straight into the next header, rendering as
          "GRAPHCOMMIT MESSAGE".
        */}
        <span
          role="columnheader"
          className="shrink-0 overflow-hidden truncate py-1"
          style={{ width: gutterWidth }}
        >
          Graph
        </span>
        <ResizeHandle
          resizable={columns.graph}
          axis="x"
          gap={HEADER_GAP}
          label="Resize graph column"
        />

        {/*
          Stands in for the rows' lane rail. It labels nothing, but the header
          and the rows have to lay out on the same grid — an element present in
          one and absent from the other slides every column after it out of step
          by its width plus a gap.
        */}
        {theme.node === 'avatar' ? (
          <span aria-hidden className="shrink-0" style={{ width: RAIL_WIDTH }} />
        ) : null}

        <span role="columnheader" className="min-w-0 flex-1 py-1">
          Commit message
        </span>

        {/* Only where the node is a dot; see `showsAuthorColumn`. */}
        {showsAuthorColumn(theme) ? (
          <ResizableColumn label="Author" resizable={columns.author} />
        ) : null}
        <ResizableColumn label="Date" resizable={columns.date} />
        <ResizableColumn label="SHA" resizable={columns.sha} />
      </div>
    </div>
  );
}

function ResizableColumn({ label, resizable }: { label: string; resizable: Resizable }) {
  return (
    <>
      <ResizeHandle
        resizable={resizable}
        axis="x"
        gap={HEADER_GAP}
        label={`Resize ${label} column`}
      />
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
