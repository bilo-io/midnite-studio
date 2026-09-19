import type { AgentDefinition, CommitProvenance, GraphRow } from '@midnite/studio-shared';

import { GraphDefs, avatarClipId } from '../graph/graph-defs';
import { GraphSvg } from '../graph/graph-svg';
import { graphThemeFor } from '../graph/graph-themes';
import {
  PROVENANCE_MARK_MODES,
  PROVENANCE_SWAP_MS,
  provenanceMarkMode,
  type ProvenanceMarkMode,
} from '../graph/provenance-display';
import { ProvenanceMark } from '../graph/provenance-mark';
import { useUiStore } from '../../store/ui-store';

const LABELS: Record<ProvenanceMarkMode, { label: string; blurb: string }> = {
  badge: {
    label: 'Corner badge',
    blurb: 'A small glyph over the avatar’s corner. The face stays whole.',
  },
  beside: {
    label: 'Beside the avatar',
    blurb: 'Its own slot next to the node, at roughly twice the badge’s size.',
  },
  swap: {
    label: 'Alternating',
    blurb: `The node turns between the face and the agent every ${Math.round(
      PROVENANCE_SWAP_MS / 1000,
    )}s — both at full size.`,
  },
};

/**
 * The preview agent.
 *
 * Claude by id rather than a resolved definition from `useAgents`: this card is
 * an illustration of a LAYOUT, and a settings page that renders a different
 * glyph depending on which agents happen to be installed would show a different
 * picture on every machine. `resolveAgentIcon` falls back on its own for an
 * unknown id, so the preview can never be blank.
 */
const PREVIEW_AGENT: AgentDefinition = {
  id: 'claude',
  label: 'Claude',
  command: 'claude',
  args: [],
  accent: '#d97757',
};

const PREVIEW_PROVENANCE: CommitProvenance = {
  kind: 'agent',
  source: 'author',
  agentIds: ['claude'],
};

/**
 * Two rows of the same synthetic history the style picker draws, at the one
 * style whose node is big enough for the difference between the modes to be
 * visible at all.
 */
const PREVIEW_ROWS: GraphRow[] = [
  {
    row: 0,
    lane: 0,
    colorIdx: 0,
    laneCount: 1,
    edges: [{ fromLane: 0, toLane: 0, type: 'merge', colorIdx: 0 }],
    commit: previewCommit('a1', 'Ada Lovelace', 'ada@example.com'),
  },
  {
    row: 1,
    lane: 0,
    colorIdx: 0,
    laneCount: 1,
    edges: [
      { fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 },
      { fromLane: 0, toLane: 0, type: 'merge', colorIdx: 0 },
    ],
    commit: previewCommit('b2', 'Grace Hopper', 'grace@example.com'),
  },
];

function previewCommit(sha: string, authorName: string, authorEmail: string) {
  return {
    sha,
    parents: [],
    authorName,
    authorEmail,
    authorDate: 0,
    committerDate: 0,
    subject: '',
    refs: [],
    coAuthors: [],
    sessionTrailers: [],
  };
}

/**
 * Where a commit's agent mark goes.
 *
 * A third axis beside style and density, and for the same reason those two are
 * separate: "which graph do I like", "how much history fits" and "how loudly
 * should the agent be named" are independent questions, and folding this one
 * into the style cards would triple them.
 *
 * Each card previews itself at the GitKraken style's node size rather than the
 * active one. The differences here are a few pixels apart on a 16px node, and a
 * preview that honestly showed `git-graph`'s would be a picture of nothing.
 *
 * The `swap` card runs the real clock, so it demonstrates itself: whatever its
 * node is showing when you look at it is what the graph would be showing too.
 * It costs nothing extra — the clock is one shared interval, and this page is
 * the one place a user has actually asked to see the mode.
 */
export function ProvenanceMarkPicker() {
  const active = provenanceMarkMode(useUiStore((s) => s.graphProvenanceMark));
  const setMode = useUiStore((s) => s.setGraphProvenanceMark);
  const theme = graphThemeFor('gitkraken', 'comfortable');
  const width = 2 * theme.laneWidth;
  // The same slot size a real row computes from this style (`graph-row.tsx`).
  const besideSize = Math.max(12, Math.round(theme.avatarSize * 0.7));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {PROVENANCE_MARK_MODES.map((mode) => {
        const selected = active === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected}
            onClick={() => setMode(mode)}
            className={`flex flex-col gap-2 rounded-md border p-3 text-left transition-colors ${
              selected
                ? 'border-primary bg-accent'
                : 'border-border hover:border-primary/50 hover:bg-accent/40'
            }`}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{LABELS[mode].label}</span>
              {selected ? (
                <span className="text-[10px] uppercase text-primary">Active</span>
              ) : null}
            </span>

            <span
              data-testid={`provenance-mode-preview-${mode}`}
              className="flex flex-col overflow-hidden rounded-md bg-background/60 p-1"
            >
              {/*
                One flex line per commit — gutter SVG, then the `beside` slot —
                because that is exactly how a real row is built. A preview that
                stacked the SVGs in one column and hung the mark off the side
                would show the mark floating between two rows rather than
                against one.
              */}
              {PREVIEW_ROWS.map((row) => (
                <span key={row.commit.sha} className="flex items-center gap-2">
                  <GraphSvg
                    row={row}
                    width={width}
                    theme={theme}
                    laneWidth={theme.laneWidth}
                    clipId={avatarClipId(theme)}
                    provenance={PREVIEW_PROVENANCE}
                    agent={PREVIEW_AGENT}
                    markMode={mode}
                  />
                  {mode === 'beside' ? (
                    <span
                      className="flex shrink-0 items-center justify-center rounded-full"
                      style={{
                        width: besideSize,
                        height: besideSize,
                        backgroundColor: `${PREVIEW_AGENT.accent}25`,
                        boxShadow: `0 0 0 1px ${PREVIEW_AGENT.accent}`,
                      }}
                    >
                      <ProvenanceMark
                        provenance={PREVIEW_PROVENANCE}
                        agent={PREVIEW_AGENT}
                        size={Math.round(besideSize * 0.66)}
                      />
                    </span>
                  ) : null}
                </span>
              ))}
            </span>

            <span className="text-xs leading-relaxed text-muted-foreground">
              {LABELS[mode].blurb}
            </span>
          </button>
        );
      })}

      {/*
        One set of marker/clip defs for the whole grid, not one per card: the
        ids are keyed by theme id, and all three cards draw the same theme — a
        copy per card would put three elements with the same id in the document,
        which is exactly the hazard the per-theme keying exists to avoid.
      */}
      <GraphDefs theme={theme} />
    </div>
  );
}
