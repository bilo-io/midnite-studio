import type { StatusResult } from '@midnite/studio-shared';

import { CiSpacer } from './ci-cell';
import {
  RAIL_WIDTH,
  laneCentre,
  nodeExtent,
  showsAuthorColumn,
  type GraphTheme,
} from './graph-themes';
import { laneColor } from './lane-colors';
import { usePrimaryHsl } from './primary-lane';

/**
 * The working copy, drawn as the row above the first commit.
 *
 * GitKraken, Sourcetree and Fork all put it there, and for the same reason: the
 * uncommitted changes ARE the tip of the branch as far as the user is
 * concerned, and a history that starts at the last commit quietly omits the
 * only part of it they can still change.
 *
 * It is a pseudo-row, not a `GraphRow` — it has no sha, no author and no
 * parents, and giving it a fake one would put it into `graph-store`, the
 * virtualizer's index space and every `rows[i]` lookup as something that has to
 * be excluded again at each of them. It is rendered as a sibling above the
 * scroller instead, so the list underneath is still exactly the commits.
 *
 * Everything about it is deliberately unlike a commit:
 *
 * - the node is a DASHED ring, not a filled dot or a face — there is no author
 *   and no object, and a solid node would claim both;
 * - the lane below it is dashed too, running down to the row edge to meet the
 *   first commit's lane: the connection is real, the commit is not yet;
 * - the text is italic and muted, and says a count rather than a subject.
 */
export function UncommittedRow({
  status,
  theme,
  gutterWidth,
  laneWidth,
  colorIdx,
  lane,
  expanded = false,
  onSelect,
}: {
  status: StatusResult;
  theme: GraphTheme;
  gutterWidth: number;
  laneWidth: number;
  /** Lane colour of HEAD's commit, so the dashed lane matches the solid one. */
  colorIdx: number;
  /** Lane HEAD's commit sits on — not necessarily 0, and not necessarily row 0. */
  lane: number;
  /** Whether the working copy's inline panel is open under the row. */
  expanded?: boolean;
  /** Toggles that inline panel — the working copy's list, commit box and diff. */
  onSelect: () => void;
}) {
  const count = status.entries.length;
  const conflicted = status.entries.filter((entry) => entry.conflicted).length;
  const label =
    `${count} uncommitted ${count === 1 ? 'change' : 'changes'}` +
    (conflicted > 0 ? ` — ${conflicted} conflicted` : '');
  usePrimaryHsl();
  const color = laneColor(colorIdx, theme.palette);
  const mid = theme.rowHeight / 2;
  const nodeX = laneCentre(theme, laneWidth, lane);
  const radius = Math.max(3, nodeExtent(theme) - theme.strokeWidth);

  return (
    /*
      A button that looks like a row, not a `role="row"`.
      
      It sits ABOVE the `role="grid"` scroller, so a row role here would be an
      orphan with no grid owner — and it does not behave like a row either:
      there is nothing to select, only a panel to open. So it is a disclosure
      button (`aria-expanded`), never a selected row. Tying a selected state to
      `selectedCommitSha === null` once made it render as selected on load and
      after every repo switch, announcing a selection the user had not made.
    */
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={expanded}
      aria-label={`${label} — ${expanded ? 'hide' : 'show'} the changes`}
      data-testid="uncommitted-row"
      className={`relative flex w-full shrink-0 cursor-default items-center gap-2 border-b border-dashed border-border/60 pr-3 text-left text-sm transition-colors ${
        expanded ? 'bg-accent/30' : 'hover:bg-accent/30'
      }`}
      style={{ height: theme.rowHeight }}
    >

      {/* Empty BRANCH / TAG cell: nothing points at the working copy. */}
      <div className="graph-ref-col pl-2" style={{ width: 'var(--col-branch-tag)' }} />
      {/* The CI column's slot — nothing to show, but the grid has to match. */}
      <CiSpacer />

      <span className="flex shrink-0 items-center">
        <svg
          width={gutterWidth}
          height={theme.rowHeight}
          viewBox={`0 0 ${gutterWidth} ${theme.rowHeight}`}
          className="block shrink-0 overflow-visible"
          aria-hidden
          data-graph-gutter
        >
          {/*
            The lane below the node, reaching the row's bottom edge where the
            first commit's own lane picks it up. Dashed, because what it joins
            is not committed yet.
          */}
          <line
            x1={nodeX}
            y1={mid + radius}
            x2={nodeX}
            y2={theme.rowHeight}
            stroke={color}
            strokeWidth={theme.strokeWidth}
            strokeDasharray={`${theme.strokeWidth * 2} ${theme.strokeWidth * 1.5}`}
          />
          <circle
            cx={nodeX}
            cy={mid}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={theme.strokeWidth}
            strokeDasharray={`${theme.strokeWidth * 2} ${theme.strokeWidth * 1.5}`}
          />
        </svg>
      </span>

      {/*
        The rail the avatar styles draw beside every commit — dashed here, and
        only where the styles draw one at all, so the row lines up with its
        neighbours instead of shifting the subject column by three pixels.
      */}
      {theme.node === 'avatar' ? (
        <span
          aria-hidden
          className="shrink-0"
          style={{
            width: RAIL_WIDTH,
            height: theme.rowHeight,
            backgroundImage: `repeating-linear-gradient(to bottom, ${color} 0 4px, transparent 4px 7px)`,
          }}
        />
      ) : null}

      <div className="graph-msg-col flex flex-1 items-center gap-2 overflow-hidden">
        <span className="min-w-0 flex-1 truncate italic text-muted-foreground">{label}</span>
      </div>

      {/*
        The trailing columns exist but stay empty: the working copy has no
        author, no commit date and no sha. Kept as spacers so the row's columns
        line up with the table under it rather than letting the text run to the
        window edge.
      */}
      {showsAuthorColumn(theme) ? (
        <span className="shrink-0" style={{ width: 'var(--col-author)' }} />
      ) : null}
      <span className="shrink-0" style={{ width: 'var(--col-date)' }} />
      <span className="shrink-0" style={{ width: 'var(--col-sha)' }} />
    </button>
  );
}

/**
 * Whether there is anything to draw.
 *
 * An unborn repo has no commits to sit above and nothing staged, so the row
 * would be the whole graph — `Graph` shows the working-copy panel on its own then.
 */
export const hasUncommittedWork = (status: StatusResult | undefined): status is StatusResult =>
  status !== undefined && !status.branch.unborn && status.entries.length > 0;
