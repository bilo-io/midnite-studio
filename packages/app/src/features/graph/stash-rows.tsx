import type { StashEntry } from '@midnite/studio-shared';
import { LuPackage } from 'react-icons/lu';

import { useUiStore } from '../../store/ui-store';
import { toggleRepoSection } from '../repos/view-sections';
import { RAIL_WIDTH, laneCentre, nodeExtent, showsAuthorColumn, type GraphTheme } from './graph-themes';
import { laneColor } from './lane-colors';

/** How many stash entries the graph shows before collapsing into an overflow row. */
const VISIBLE_CAP = 2;

/**
 * Stashes, drawn as pseudo-rows above the scroller (Phase 22 Theme C).
 *
 * A stash is shelved uncommitted work, not history — the same reasoning that
 * keeps `UncommittedRow` out of `graph-store` and the virtualizer's index
 * space applies here, so this sits beside it rather than inside the streamed
 * commit list. Unlike the working copy, though, each entry IS something to
 * select: clicking one opens the stash inspector (Theme D), which is the
 * whole point of drawing them at all.
 *
 * Visually a dashed ring and a dashed lane, same as `UncommittedRow` — there
 * is no author and no real commit object behind either kind of row, and a
 * solid node would claim both. Newest first, matching the sidebar's own
 * stash list order.
 */
export function StashRows({
  repoId,
  stashes,
  theme,
  gutterWidth,
  laneWidth,
  colorIdx,
  lane,
  selectedSelector,
  onSelect,
}: {
  repoId: string;
  stashes: readonly StashEntry[];
  theme: GraphTheme;
  gutterWidth: number;
  laneWidth: number;
  /** Lane colour and position of HEAD's commit, so the dashed lane matches the solid one. */
  colorIdx: number;
  lane: number;
  selectedSelector: string | null;
  onSelect: (selector: string) => void;
}) {
  const shown = stashes.slice(0, VISIBLE_CAP);
  const overflow = stashes.length - shown.length;

  return (
    <>
      {shown.map((entry) => (
        <StashRow
          key={entry.selector}
          entry={entry}
          theme={theme}
          gutterWidth={gutterWidth}
          laneWidth={laneWidth}
          colorIdx={colorIdx}
          lane={lane}
          selected={selectedSelector === entry.selector}
          onSelect={() => onSelect(entry.selector)}
        />
      ))}
      {overflow > 0 ? (
        <StashOverflowRow repoId={repoId} count={overflow} theme={theme} />
      ) : null}
    </>
  );
}

function StashRow({
  entry,
  theme,
  gutterWidth,
  laneWidth,
  colorIdx,
  lane,
  selected,
  onSelect,
}: {
  entry: StashEntry;
  theme: GraphTheme;
  gutterWidth: number;
  laneWidth: number;
  colorIdx: number;
  lane: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = laneColor(colorIdx, theme.palette);
  const mid = theme.rowHeight / 2;
  const nodeX = laneCentre(theme, laneWidth, lane);
  const radius = Math.max(3, nodeExtent(theme) - theme.strokeWidth);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      aria-label={`Stash: ${entry.message}`}
      className={`relative flex w-full shrink-0 cursor-default items-center gap-2 border-b border-dashed border-border/60 pr-3 text-left text-sm transition-colors ${
        selected ? 'bg-accent/40' : 'hover:bg-accent/30'
      }`}
      style={{ height: theme.rowHeight }}
    >
      {selected ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: color }}
        />
      ) : null}

      {/* Empty BRANCH / TAG cell: nothing points at a stash. */}
      <div className="shrink-0 pl-2" style={{ width: 'var(--col-branch-tag)' }} />

      <span className="flex shrink-0 items-center">
        <svg
          width={gutterWidth}
          height={theme.rowHeight}
          viewBox={`0 0 ${gutterWidth} ${theme.rowHeight}`}
          className="block shrink-0 overflow-visible"
          aria-hidden
          data-graph-gutter
        >
          <line
            x1={nodeX}
            y1={0}
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

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <LuPackage aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate italic text-muted-foreground">
          {entry.message}
        </span>
      </div>

      {showsAuthorColumn(theme) ? (
        <span className="shrink-0" style={{ width: 'var(--col-author)' }} />
      ) : null}
      <span className="shrink-0" style={{ width: 'var(--col-date)' }} />
      <span className="shrink-0" style={{ width: 'var(--col-sha)' }} />
    </button>
  );
}

/**
 * The rest of the list, past `VISIBLE_CAP` — a count rather than more rows,
 * so a repository with a long stash habit does not push the actual commit
 * history further down the pane every time it grows by one.
 *
 * Clicking it opens the sidebar's own Stashes section, which already lists
 * every entry — this row's job is pointing there, not repeating the list.
 */
function StashOverflowRow({
  repoId,
  count,
  theme,
}: {
  repoId: string;
  count: number;
  theme: GraphTheme;
}) {
  const closed = useUiStore((s) => s.collapsedRepoSections[repoId]);

  return (
    <button
      type="button"
      onClick={() => {
        if (closed?.includes('stashes')) toggleRepoSection(repoId, 'stashes');
      }}
      className="flex w-full shrink-0 cursor-default items-center border-b border-dashed border-border/60 pl-3 pr-3 text-left text-xs italic text-muted-foreground transition-colors hover:bg-accent/30"
      style={{ height: theme.rowHeight }}
    >
      +{count} more {count === 1 ? 'stash' : 'stashes'} — see the sidebar
    </button>
  );
}
