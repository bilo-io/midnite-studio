import type { CommitCi } from '@midnite/studio-shared';

import { Tooltip } from '../../components/tooltip';
import { runStatus, StatusGlyph } from '../forge/forge-status';
import { ROW_GAP } from './graph-themes';

/**
 * The CI column's width in px — one status glyph plus its backing.
 *
 * Fixed rather than resizable: the column only ever holds one 14px mark, and a
 * drag handle on a column that narrow would be a handle wider than its content.
 * Published as `--col-ci` so the header, every commit row and the working-copy
 * and stash pseudo-rows lay out on the same grid.
 */
export const CI_COLUMN_WIDTH = 20;

/** "CI: failed — open run", the button's accessible name. */
export function ciAriaLabel(ci: CommitCi): string {
  return `CI: ${runStatus(ci.representative).label.toLowerCase()} — open run`;
}

/** The hover bubble — the verdict, plus how many workflows it summarises. */
function ciTooltip(ci: CommitCi): string {
  const verdict = runStatus(ci.representative).label;
  return ci.runs.length > 1 ? `CI: ${verdict} · ${ci.runs.length} workflows` : `CI: ${verdict}`;
}

/**
 * One commit's CI cell: the status mark, sitting ON the lane connector.
 *
 * The ref badge's leader line (`graph-row.tsx`'s `data-graph-connector` rule
 * plus `GraphSvg`'s `-ROW_GAP` segment) used to run from the chip straight to
 * the node. With this column between them, the line has to cross it — so the
 * cell draws its own segment, from `-ROW_GAP` (the row gap before it) to its
 * right edge, where `GraphSvg` picks the line up again across the gap after
 * it. Same colour, stroke and opacity as the other two halves, so the three
 * read as one line; the glyph sits above it on an opaque round backing, which
 * keeps the mark legible over any lane colour.
 *
 * `hidden` columns are a CSS concern (`[data-graph-ci='off']` in
 * `styles.css`), not a prop, so toggling the column never re-renders a row.
 */
export function CiCell({
  sha,
  ci,
  connector,
  onOpen,
}: {
  sha: string;
  ci: CommitCi | undefined;
  /** The leader line's paint, when this row has refs — `null` otherwise. */
  connector: { color: string; opacity: number; strokeWidth: number; glow: boolean } | null;
  onOpen?: (sha: string) => void;
}) {
  return (
    <span data-graph-ci-cell className="graph-ci-col relative flex shrink-0 items-center justify-center self-stretch">
      {connector ? (
        <span
          aria-hidden
          data-graph-connector
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 transition-opacity duration-150 ease-in-out ${
            connector.glow ? 'graph-rail-glow' : ''
          }`}
          style={{
            left: -ROW_GAP,
            right: 0,
            height: connector.strokeWidth,
            backgroundColor: connector.color,
            opacity: connector.opacity,
          }}
        />
      ) : null}
      {ci ? (
        <Tooltip label={ciTooltip(ci)}>
          <button
            type="button"
            data-testid="graph-ci-button"
            data-ci-status={ci.representative.status === 'completed' ? ci.representative.conclusion : ci.representative.status}
            aria-label={ciAriaLabel(ci)}
            onClick={(event) => {
              // The row's own click selects the commit; this one opens its run.
              event.stopPropagation();
              onOpen?.(sha);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            className="relative z-[1] grid size-[18px] place-items-center rounded-full bg-background transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <StatusGlyph status={runStatus(ci.representative)} />
          </button>
        </Tooltip>
      ) : null}
    </span>
  );
}

/** The CI column's slot in a row that never has CI — the working copy, a stash. */
export function CiSpacer() {
  return <span aria-hidden className="graph-ci-col shrink-0" />;
}
