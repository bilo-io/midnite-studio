import { Tooltip } from './tooltip';

/**
 * The uncommitted-change count for one checkout, as VS Code renders it: a
 * small filled pill in the accent colour, sitting on the row it belongs to.
 *
 * A pill rather than the grey `↑3 ↓1` treatment beside it, on purpose. Those
 * counts are about the remote and are read at a glance while scanning; this
 * one is about work that only exists on this machine, and it is the number the
 * sidebar exists to surface. Giving it the primary colour is what makes "where
 * did I leave off" answerable without opening anything.
 *
 * Renders nothing at zero. A `0` badge on every clean checkout would turn the
 * tree into a column of noise and make a real count harder to spot, which is
 * the same reasoning that keeps `BranchDot` off branches git has nothing to
 * say about.
 */
export function ChangeCountPill({
  count,
  what,
  conflicted = 0,
}: {
  /** Changed PATHS, not edits — a file can be staged and unstaged at once. */
  count: number;
  /** Named in the tooltip, so the number always says what it is counting. */
  what: string;
  /** Conflicts outrank everything: the pill turns destructive-coloured. */
  conflicted?: number;
}) {
  if (count <= 0) return null;

  const label =
    conflicted > 0
      ? `${what}: ${conflicted} conflicted of ${count} changed ${plural(count, 'file')}`
      : `${what}: ${count} changed ${plural(count, 'file')}`;

  return (
    <Tooltip label={label}>
      <span
        data-testid="change-count"
        aria-label={label}
        className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium leading-none tabular-nums ${
          conflicted > 0
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground'
        }`}
      >
        {count}
      </span>
    </Tooltip>
  );
}

const plural = (count: number, word: string): string => (count === 1 ? word : `${word}s`);
