import type { GraphRow, Ref } from '@midnite-git/shared';
import { memo } from 'react';

import { GraphSvg, LANE_WIDTH, ROW_HEIGHT } from './graph-svg';
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
  onSelect: (sha: string) => void;
};

function GraphRowInner({ row, refs, selected, gutterLanes, onSelect }: GraphRowProps) {
  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={-1}
      onClick={() => onSelect(row.commit.sha)}
      className={`flex cursor-default items-center gap-2 pr-3 text-sm ${
        selected ? 'bg-accent/70' : 'hover:bg-accent/30'
      }`}
      style={{ height: ROW_HEIGHT }}
    >
      <GraphSvg row={row} width={gutterLanes * LANE_WIDTH} />

      {/*
        `overflow-hidden` plus a shrinkable badge group, not just `truncate` on
        the subject. Long branch names are the norm, and a row carrying two of
        them (`feature/x` + `origin/feature/x`) otherwise pushes straight
        through the author and date columns — the badges are the widest thing in
        the row and nothing was allowed to give.
      */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {refs.length > 0 ? (
          <span className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden">
            {refs.map((ref) => (
              <RefBadge key={ref.fullName} refItem={ref} />
            ))}
          </span>
        ) : null}
        {/* The subject gives up its space last: badges are short and fixed,
            a subject is long and its tail is the least important part. */}
        <span className="min-w-0 flex-1 truncate">{row.commit.subject}</span>
      </div>

      <span className="w-40 shrink-0 truncate text-right text-xs text-muted-foreground">
        {row.commit.authorName}
      </span>
      <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {formatDate(row.commit.committerDate)}
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {row.commit.sha.slice(0, 7)}
      </span>
    </div>
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
