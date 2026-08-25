import type { GraphRow } from '@midnite/git-shared';

import { GraphDefs, avatarClipId } from '../graph/graph-defs';
import { GraphSvg } from '../graph/graph-svg';
import { GRAPH_THEMES, GRAPH_THEME_IDS, type GraphThemeId } from '../graph/graph-themes';
import { cascadeStyle } from '../../lib/cascade';
import { useUiStore } from '../../store/ui-store';

/**
 * A synthetic history, laid out by hand.
 *
 * Hand-built rather than sampled from the open repo so every card shows the same
 * shapes — a branch opening, a lane running alongside, a merge closing it — and
 * the cards differ ONLY by style. A preview drawn from real history would make
 * styles look different because they were drawing different commits.
 */
const PREVIEW_ROWS: GraphRow[] = [
  {
    row: 0,
    lane: 0,
    colorIdx: 0,
    laneCount: 1,
    edges: [{ fromLane: 0, toLane: 0, type: 'merge', colorIdx: 0 }],
    commit: commit('a1', ['b2'], 'Ada Lovelace', 'ada@example.com'),
  },
  {
    row: 1,
    lane: 0,
    colorIdx: 0,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 },
      { fromLane: 0, toLane: 0, type: 'merge', colorIdx: 0 },
      { fromLane: 0, toLane: 1, type: 'merge', colorIdx: 1 },
    ],
    commit: commit('b2', ['c3', 'd4'], 'Grace Hopper', 'grace@example.com'),
  },
  {
    row: 2,
    lane: 1,
    colorIdx: 1,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'straight', colorIdx: 0 },
      { fromLane: 1, toLane: 1, type: 'branch', colorIdx: 1 },
      { fromLane: 1, toLane: 1, type: 'merge', colorIdx: 1 },
    ],
    commit: commit('d4', ['c3'], 'Alan Turing', 'alan@example.com'),
  },
  {
    row: 3,
    lane: 0,
    colorIdx: 0,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 },
      { fromLane: 1, toLane: 0, type: 'branch', colorIdx: 1 },
      { fromLane: 0, toLane: 0, type: 'merge', colorIdx: 0 },
    ],
    commit: commit('c3', ['e5'], 'Ada Lovelace', 'ada@example.com'),
  },
];

function commit(sha: string, parents: string[], authorName: string, authorEmail: string) {
  return {
    sha,
    parents,
    authorName,
    authorEmail,
    authorDate: 0,
    committerDate: 0,
    subject: '',
    refs: [],
  };
}

/** Pick the graph style. One card per style, each drawing the same history its own way. */
export function GraphThemePicker() {
  const active = useUiStore((s) => s.graphTheme);
  const setGraphTheme = useUiStore((s) => s.setGraphTheme);

  return (
    <div className="grid grid-cols-1 gap-3 px-3 pb-2 sm:grid-cols-2">
      {GRAPH_THEME_IDS.map((id, index) => (
        <ThemeCard
          key={id}
          id={id}
          active={active === id}
          index={index}
          onSelect={() => setGraphTheme(id)}
        />
      ))}
    </div>
  );
}

function ThemeCard({
  id,
  active,
  index,
  onSelect,
}: {
  id: GraphThemeId;
  active: boolean;
  index: number;
  onSelect: () => void;
}) {
  const theme = GRAPH_THEMES[id];
  const width = 5 * theme.laneWidth;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      style={cascadeStyle(index)}
      className={`flex animate-fade-in-up cascade-delay flex-col gap-2 rounded-lg border p-3 text-left transition-colors ${
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:bg-accent/30'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{theme.label}</span>
        {active ? <span className="text-[10px] uppercase text-primary">Active</span> : null}
      </div>

      <div className="relative overflow-hidden rounded-md bg-background/60 p-1">
        {/*
          Each card carries its own defs: the markers and the clip are keyed by
          theme id, and a card for a style that is not the active one would
          otherwise reference definitions no one has rendered.
        */}
        <GraphDefs theme={theme} />
        {PREVIEW_ROWS.map((row) => (
          <GraphSvg
            key={row.commit.sha}
            row={row}
            width={width}
            theme={theme}
            // The preview is never resized, so the style's own spacing is the
            // only honest thing to draw it at.
            laneWidth={theme.laneWidth}
            clipId={avatarClipId(theme)}
          />
        ))}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{theme.blurb}</p>
    </button>
  );
}
