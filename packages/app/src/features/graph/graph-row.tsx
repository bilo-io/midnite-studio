import type { GraphRow, Ref } from '@midnite/git-shared';
import { memo } from 'react';

import { Tooltip } from '../../components/tooltip';
import { useCommitDnd, useRefDnd } from './graph-dnd';
import { GraphSvg } from './graph-svg';
import type { GraphTheme } from './graph-themes';
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
  gutterLanes: number;
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
  gutterLanes,
  theme,
  clipId,
  dimmed,
  onSelect,
  onContextMenu,
  onRefContextMenu,
  onRefActivate,
}: GraphRowProps) {
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
        {refs.map((ref) => (
          <DraggableRefBadge
            key={ref.fullName}
            refItem={ref}
            rowId={row.commit.sha}
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
          <span className="inline-flex">
            <GraphSvg
              row={row}
              width={gutterLanes * theme.laneWidth}
              theme={theme}
              clipId={clipId}
              dimmed={dimmed}
            />
          </span>
        </Tooltip>
      </CommitDragHandle>

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

        There is no Author column any more — the avatar in the node carries the
        author, and its tooltip carries the name.
      */}
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
      className={`shrink-0 ${isDragging ? 'opacity-40' : ''}`}
    >
      {children}
    </span>
  );
}

function DraggableRefBadge({
  refItem,
  rowId,
  onContextMenu,
  onDoubleClick,
}: {
  refItem: Ref;
  rowId: string;
  onContextMenu: (event: React.MouseEvent) => void;
  onDoubleClick: (event: React.MouseEvent) => void;
}) {
  const { draggable, droppable } = useRefDnd(refItem, rowId);

  return (
    <RefBadge
      refItem={refItem}
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
