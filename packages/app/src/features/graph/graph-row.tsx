import type { GraphRow, Ref } from '@midnite/git-shared';
import { memo } from 'react';

import { Tooltip } from '../../components/tooltip';
import { useCommitDnd, useRefDnd } from './graph-dnd';
import { GraphSvg } from './graph-svg';
import { CONNECTOR_OPACITY, RAIL_WIDTH, showsAuthorColumn, type GraphTheme } from './graph-themes';
import { laneColor } from './lane-colors';
import { RefBadge } from './ref-badge';

/**
 * One commit row: lane graphic, ref badges, subject, author, date.
 *
 * Memoised because a streaming log re-renders the list on every 500-row batch —
 * around a hundred times for a large repo — and without this every visible row
 * re-renders each time.
 */
export type GraphRowProps = {
  row: GraphRow;
  refs: readonly Ref[];
  selected: boolean;
  /**
   * Painted width of the lane gutter, and the spacing between lanes inside it.
   *
   * Both live values, not derived from the theme: the gutter is a resizable
   * column, so dragging it narrower closes the lanes up and slides the indented
   * ones left. One pair for the whole list — a per-row width would make the
   * subject column jog as the graph narrows and widens while you scroll.
   *
   * They are the only geometry the row takes as props rather than as a CSS
   * variable, and they do bust this component's memo on every pointermove of a
   * gutter drag. That is a real cost paid deliberately: SVG coordinates are
   * attributes, not styles, so no custom property can reach them, and the drag
   * re-renders only the ~30 rows the virtualizer has mounted.
   */
  gutterWidth: number;
  laneWidth: number;
  theme: GraphTheme;
  /** Id of the list-level avatar clip path. */
  clipId: string;
  /** Author-filtered out — drawn back, never removed. */
  dimmed: boolean;
  onSelect: (sha: string) => void;
  onContextMenu: (event: React.MouseEvent, row: GraphRow) => void;
  onRefContextMenu: (event: React.MouseEvent, ref: Ref) => void;
  /** Double-clicking a branch badge checks it out — the GitKraken gesture. */
  onRefActivate: (ref: Ref) => void;
};

function GraphRowInner({
  row,
  refs,
  selected,
  gutterWidth,
  laneWidth,
  theme,
  clipId,
  dimmed,
  onSelect,
  onContextMenu,
  onRefContextMenu,
  onRefActivate,
}: GraphRowProps) {
  // `refs` arrives sorted by importance (HEAD, locals, remotes, tags), so the
  // slice keeps the ref you most need to see and buries the ones you don't.
  const shown = refs.length > REF_CHIP_CAP ? refs.slice(0, REF_CHIP_CAP) : refs;
  const hidden = refs.length > REF_CHIP_CAP ? refs.slice(REF_CHIP_CAP) : EMPTY_REFS;

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={-1}
      onClick={() => onSelect(row.commit.sha)}
      onContextMenu={(event) => {
        event.preventDefault();
        // Right-click selects too, so the detail pane matches the menu's target.
        onSelect(row.commit.sha);
        onContextMenu(event, row);
      }}
      className={`flex cursor-default items-center gap-2 pr-3 text-sm transition-colors ${
        selected ? 'bg-accent/70' : 'hover:bg-accent/30'
      }`}
      style={{ height: theme.rowHeight }}
    >
      {/*
        BRANCH / TAG, in its own column so labels line up vertically instead of
        floating at whatever horizontal position each subject happens to start.
        Most commits have none, and the empty cell is the price of the ones that
        do being scannable.
      */}
      <div
        className="flex shrink-0 items-center gap-1 overflow-hidden pl-2"
        style={{ width: 'var(--col-branch-tag)' }}
      >
        {shown.map((ref) => (
          <DraggableRefBadge
            key={ref.fullName}
            refItem={ref}
            rowId={row.commit.sha}
            colorIdx={row.colorIdx}
            palette={theme.palette}
            onContextMenu={(event) => {
              // Stop the row's own menu opening as well — the badge's menu is
              // the more specific target the user aimed at.
              event.preventDefault();
              event.stopPropagation();
              onRefContextMenu(event, ref);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onRefActivate(ref);
            }}
          />
        ))}

        {/*
          The overflow counter, GitKraken's answer to a commit that five refs
          point at. A fixed cap rather than a measured fit: the alternative is a
          ResizeObserver per row, and this list is virtualized over 50 000 of
          them. The names live in the tooltip so a hidden ref is still findable.
        */}
        {hidden.length > 0 ? (
          <span
            title={hidden.map((ref) => ref.name).join('\n')}
            className="shrink-0 rounded-[3px] border border-border bg-muted/60 px-1 py-px text-[11px] leading-4 text-muted-foreground"
          >
            +{hidden.length}
          </span>
        ) : null}

        {/*
          The chip's half of the leader line: a rule stretching to the column's
          right edge, where `GraphSvg` picks it up and carries it across the
          row's gap to the node. Two halves rather than one element because the
          left half has to start after chips of unknown width — which is exactly
          what `flex-1` solves and what an SVG with a fixed viewBox cannot.

          `min-w-0`, so a row whose chips already fill the column gives up the
          rule entirely instead of squeezing the names it exists to point at.
        */}
        {refs.length > 0 ? (
          <span
            aria-hidden
            className="min-w-0 flex-1"
            style={{
              height: theme.strokeWidth,
              backgroundColor: laneColor(row.colorIdx, theme.palette),
              opacity: CONNECTOR_OPACITY,
            }}
          />
        ) : null}
      </div>

      {/*
        The lane gutter doubles as the commit's drag handle. Dragging from the
        subject text would fight text selection, and the node is the thing that
        visually *is* the commit.
      */}
      <CommitDragHandle sha={row.commit.sha} subject={row.commit.subject}>
        {/*
          The bubble names the author, so the tooltip is what replaced the
          Author column rather than a decoration on top of it.
        */}
        <Tooltip
          label={
            <span className="block">
              <span className="block font-medium">{row.commit.authorName}</span>
              <span className="block text-muted-foreground">{row.commit.authorEmail}</span>
              <span className="block text-muted-foreground">
                {new Date(row.commit.authorDate * 1000).toLocaleString()}
              </span>
            </span>
          }
        >
          {/* `flex`, not `inline-flex` — see the note on the SVG's own `block`. */}
          <span className="flex">
            <GraphSvg
              row={row}
              width={gutterWidth}
              theme={theme}
              laneWidth={laneWidth}
              clipId={clipId}
              dimmed={dimmed}
              connector={refs.length > 0}
            />
          </span>
        </Tooltip>
      </CommitDragHandle>

      {/*
        GitKraken's rail: a bar in the lane's colour standing between the graph
        and the message, so the subject you are reading is tied to the branch it
        landed on without your eye travelling back to the node.
      */}
      {theme.node === 'avatar' ? (
        <span
          aria-hidden
          className={`shrink-0 rounded-full transition-opacity duration-150 ease-in-out ${
            dimmed ? 'opacity-40' : ''
          }`}
          style={{
            width: RAIL_WIDTH,
            // Full row height, so a run of commits on one branch reads as one
            // continuous rail rather than a column of ticks.
            height: theme.rowHeight,
            backgroundColor: laneColor(row.colorIdx, theme.palette),
          }}
        />
      ) : null}

      {/*
        `overflow-hidden` plus a shrinkable badge group, not just `truncate` on
        the subject. Long branch names are the norm, and a row carrying two of
        them (`feature/x` + `origin/feature/x`) otherwise pushes straight
        through the author and date columns — the badges are the widest thing in
        the row and nothing was allowed to give.
      */}
      <div
        className={`flex min-w-0 flex-1 items-center overflow-hidden transition-opacity duration-150 ease-in-out ${
          dimmed ? 'opacity-40' : ''
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{row.commit.subject}</span>
      </div>

      {/*
        Widths arrive as custom properties set on the scroll container, not as
        props. This component is memoised because a streaming log re-renders the
        list on every 500-row batch; a width prop would bust that memo on every
        pointermove of a column drag and push every visible row through React at
        60Hz. A variable repaints without React seeing it.

        The Author column exists only where the node is a plain dot. The four
        avatar styles have the author's face in the graph itself, and its
        tooltip carries the name — a column repeating it would be the widest
        redundancy in the table.
      */}
      {showsAuthorColumn(theme) ? (
        <span
          className={`shrink-0 truncate text-right text-xs text-muted-foreground transition-opacity duration-150 ease-in-out ${
            dimmed ? 'opacity-40' : ''
          }`}
          style={{ width: 'var(--col-author)' }}
        >
          {row.commit.authorName}
        </span>
      ) : null}
      <span
        className={`shrink-0 text-right text-xs tabular-nums text-muted-foreground transition-opacity duration-150 ease-in-out ${
          dimmed ? 'opacity-40' : ''
        }`}
        style={{ width: 'var(--col-date)' }}
      >
        {formatDate(row.commit.committerDate)}
      </span>
      <span
        className={`shrink-0 text-right font-mono text-xs text-muted-foreground transition-opacity duration-150 ease-in-out ${
          dimmed ? 'opacity-40' : ''
        }`}
        style={{ width: 'var(--col-sha)' }}
      >
        {row.commit.sha.slice(0, 7)}
      </span>
    </div>
  );
}

/**
 * A badge that is both a drag source and a drop target.
 *
 * Split into its own component because `useRefDnd` is a hook and the badges are
 * rendered in a map — the alternative is one hook call per possible badge,
 * which the rules of hooks forbid.
 */
function CommitDragHandle({
  sha,
  subject,
  children,
}: {
  sha: string;
  subject: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useCommitDnd(sha, subject);
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // `flex`, so the handle is exactly as tall as the gutter it wraps and
      // nothing inside it can be pushed off-centre by a line box.
      className={`flex shrink-0 items-center ${isDragging ? 'opacity-40' : ''}`}
    >
      {children}
    </span>
  );
}

function DraggableRefBadge({
  refItem,
  rowId,
  colorIdx,
  palette,
  onContextMenu,
  onDoubleClick,
}: {
  refItem: Ref;
  rowId: string;
  colorIdx: number;
  palette: GraphTheme['palette'];
  onContextMenu: (event: React.MouseEvent) => void;
  onDoubleClick: (event: React.MouseEvent) => void;
}) {
  const { draggable, droppable } = useRefDnd(refItem, rowId);

  return (
    <RefBadge
      refItem={refItem}
      colorIdx={colorIdx}
      palette={palette}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      dnd={{
        setNodeRef: (node) => {
          draggable.setNodeRef(node);
          droppable.setNodeRef(node);
        },
        listeners: (draggable.listeners ?? {}) as Record<string, unknown>,
        attributes: draggable.attributes as unknown as Record<string, unknown>,
        isOver: droppable.isOver,
        isDragging: draggable.isDragging,
      }}
    />
  );
}

/**
 * Chips drawn before the overflow counter takes over.
 *
 * Two, because that is what the default 180px column holds without either name
 * truncating to nothing: the pair that matters is nearly always a local branch
 * and its remote-tracking twin.
 */
const REF_CHIP_CAP = 2;

const EMPTY_REFS: readonly Ref[] = [];

export const CommitGraphRow = memo(GraphRowInner);

/**
 * Relative for anything under a week, absolute beyond it.
 *
 * "3 days ago" answers the question people actually ask of recent history,
 * while an exact date is what matters once a commit is old enough that the
 * relative form ("47 weeks ago") stops meaning anything.
 */
export function formatDate(unixSeconds: number): string {
  const then = unixSeconds * 1000;
  const deltaMs = Date.now() - then;
  const minutes = Math.floor(deltaMs / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
