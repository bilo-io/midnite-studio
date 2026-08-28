import type { StashEntry } from '@midnite/git-shared';
import { Archive, ExternalLink } from 'lucide-react';

import { formatDate } from './graph-row';
import {
  RAIL_WIDTH,
  laneCentre,
  nodeExtent,
  showsAuthorColumn,
  type GraphTheme,
} from './graph-themes';
import { laneColor } from './lane-colors';

export function StashPseudoRow({
  entry,
  theme,
  gutterWidth,
  laneWidth,
  colorIdx,
  lane,
  selected,
  onSelect,
  onContextMenu,
}: {
  entry: StashEntry;
  theme: GraphTheme;
  gutterWidth: number;
  laneWidth: number;
  colorIdx: number;
  lane: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const color = laneColor(colorIdx, theme.palette);
  const mid = theme.rowHeight / 2;
  const nodeX = laneCentre(theme, laneWidth, lane);
  const radius = Math.max(3, nodeExtent(theme) - theme.strokeWidth);

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      aria-label={`${entry.selector}: ${entry.message}`}
      className={`relative flex w-full shrink-0 cursor-default items-center gap-2 border-b border-dashed border-border/40 pr-3 text-left text-sm transition-colors ${
        selected ? 'bg-accent/60' : 'hover:bg-accent/20'
      }`}
      style={{ height: theme.rowHeight }}
    >
      <div className="shrink-0 pl-2" style={{ width: 'var(--col-branch-tag)' }}>
        <span className="inline-flex items-center gap-1 rounded bg-muted/80 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
          <Archive className="h-3 w-3" />
          {entry.selector}
        </span>
      </div>

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
            fill="var(--bg-background, #1e1e2e)"
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
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{entry.message}</span>
      </div>

      {showsAuthorColumn(theme) ? (
        <span className="shrink-0 truncate text-xs text-muted-foreground" style={{ width: 'var(--col-author)' }}>
          {entry.author.name}
        </span>
      ) : null}
      <span className="shrink-0 text-xs text-muted-foreground" style={{ width: 'var(--col-date)' }}>
        {formatDate(entry.authoredAt)}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground" style={{ width: 'var(--col-sha)' }}>
        {entry.sha.slice(0, 7)}
      </span>
    </button>
  );
}

export function StashRows({
  stashes,
  theme,
  gutterWidth,
  laneWidth,
  colorIdx,
  lane,
  selectedSha,
  onSelectStash,
  onContextMenu,
  onShowAllInSidebar,
}: {
  stashes: StashEntry[];
  theme: GraphTheme;
  gutterWidth: number;
  laneWidth: number;
  colorIdx: number;
  lane: number;
  selectedSha: string | null;
  onSelectStash: (entry: StashEntry) => void;
  onContextMenu?: (event: React.MouseEvent, entry: StashEntry) => void;
  onShowAllInSidebar?: () => void;
}) {
  if (stashes.length === 0) return null;

  const visible = stashes.slice(0, 2);
  const remaining = stashes.length - visible.length;

  return (
    <>
      {visible.map((entry) => (
        <StashPseudoRow
          key={entry.selector}
          entry={entry}
          theme={theme}
          gutterWidth={gutterWidth}
          laneWidth={laneWidth}
          colorIdx={colorIdx}
          lane={lane}
          selected={selectedSha === entry.sha}
          onSelect={() => onSelectStash(entry)}
          onContextMenu={onContextMenu ? (e) => onContextMenu(e, entry) : undefined}
        />
      ))}
      {remaining > 0 ? (
        <div
          className="flex w-full items-center justify-between border-b border-dashed border-border/40 bg-accent/10 px-3 text-xs text-muted-foreground"
          style={{ height: Math.max(24, theme.rowHeight * 0.8) }}
        >
          <span>+{remaining} more {remaining === 1 ? 'stash' : 'stashes'}</span>
          {onShowAllInSidebar ? (
            <button
              type="button"
              onClick={onShowAllInSidebar}
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <span>View in sidebar</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
