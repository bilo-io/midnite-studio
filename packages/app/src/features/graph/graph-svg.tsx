import type { GraphRow } from '@midnite/git-shared';

import { CommitAvatar } from './commit-avatar';
import {
  ARROW_GAP,
  CONNECTOR_OPACITY,
  ROW_GAP,
  laneCentre,
  nodeExtent,
  type GraphTheme,
} from './graph-themes';
import { LANE_COLOR_COUNT, laneColor } from './lane-colors';

/**
 * One row's worth of graph, as an SVG.
 *
 * SVG-per-row inside a virtualized list, rather than one big canvas or one tall
 * SVG, because it is what makes the graph a normal part of the DOM: rows are
 * hit-testable, can be drop targets for the drag gestures in Phase 8, and are
 * reachable by keyboard and screen readers. A canvas would need all of that
 * rebuilt by hand.
 *
 * The geometry follows the edge types directly, which is why they encode which
 * half of the row they occupy (see GraphEdgeType in shared):
 *
 *   straight  top edge → bottom edge, one lane
 *   branch    top edge → the node (upper half)
 *   merge     the node → bottom edge (lower half)
 */
export function GraphSvg({
  row,
  width,
  theme,
  laneWidth,
  clipId,
  dimmed = false,
  connector = false,
}: {
  row: GraphRow;
  width: number;
  theme: GraphTheme;
  /**
   * Live lane spacing, which is the style's `laneWidth` until the gutter is
   * dragged narrower than the lanes want. Passed in rather than read off the
   * theme because it is a property of the COLUMN, not of the style, and one
   * gutter width serves the whole list.
   */
  laneWidth: number;
  /** Id of the list-level avatar clip path. */
  clipId: string;
  /** Author-filtered out — drawn back, never removed. */
  dimmed?: boolean;
  /**
   * Draw the leader line joining this row's ref chips to its node.
   *
   * Set by the row only when it actually rendered chips — a connector reaching
   * back to an empty column is a line pointing at nothing.
   */
  connector?: boolean;
}) {
  const mid = theme.rowHeight / 2;
  const lane = (n: number): number => laneCentre(theme, laneWidth, n);
  const nodeX = lane(row.lane);
  const nodeColor = laneColor(row.colorIdx, theme.palette);

  return (
    <svg
      width={width}
      height={theme.rowHeight}
      viewBox={`0 0 ${width} ${theme.rowHeight}`}
      /*
        `block`, not the SVG default of `inline`. An inline box sits ON the text
        baseline, so the gutter was rendered with a line box's descender space
        beneath it — a few pixels of extra height at the bottom of its
        container, which the row's `items-center` then split evenly and pushed
        the whole graphic UP. Every node ended a few pixels above the ref chip
        pointing at it, and the leader line met the lane off-centre.
      */
      className={`block shrink-0 overflow-visible transition-opacity duration-150 ease-in-out ${
        dimmed ? 'opacity-40' : ''
      }`}
      // Decorative: the row's text already carries the commit's identity, and a
      // screen reader announcing lane geometry would be noise.
      aria-hidden
      /*
        Names the lane graphic among the several SVGs a row contains — the ref
        chips carry icons, and lucide's `Tag` and `GitBranch` are themselves
        circles and lines. Without this, "every node in the row" is a selector
        that quietly also matches the hole in a tag icon, which is how the
        gutter's own geometry went unasserted while three tests appeared to
        cover it.
      */
      data-graph-gutter
    >
      {/*
        First, so every lane paints over it.

        The connector crosses whatever lanes sit between the gutter's edge and
        this row's node — in a busy history, several of them — and a horizontal
        rule laid ON TOP of the vertical ones chops them into segments, which
        reads as history that stops and restarts. Underneath, the lanes stay
        continuous and the connector still reads as a line, because it is the
        only horizontal thing in the picture.

        It starts at `-ROW_GAP`: the row's own `gap-2`, crossed backwards out of
        the SVG (which is `overflow-visible`) to meet the rule that the
        BRANCH / TAG cell stretches to its own right edge.
      */}
      {connector ? (
        <line
          x1={-ROW_GAP}
          y1={mid}
          x2={nodeX}
          y2={mid}
          stroke={nodeColor}
          strokeWidth={theme.strokeWidth}
          strokeOpacity={CONNECTOR_OPACITY}
        />
      ) : null}

      {row.edges.map((edge, index) => {
        const color = laneColor(edge.colorIdx, theme.palette);
        const from = lane(edge.fromLane);
        const to = lane(edge.toLane);
        const key = `${edge.type}-${edge.fromLane}-${edge.toLane}-${index}`;

        /**
         * Arrowheads mark an edge ARRIVING at this commit, which is the upper
         * half — a `merge` edge leaves the node, and an arrow on its far end
         * would claim a direction the commit does not have.
         *
         * `% LANE_COLOR_COUNT` and not a literal 10: the marker ids are
         * generated from the same palette in `graph-defs`, and an eleventh hue
         * would otherwise leave every eleventh lane pointing at a `url(#…)`
         * that was never defined.
         */
        const arrow =
          theme.arrowheads && edge.type === 'branch'
            ? `url(#mgit-arrow-${edge.colorIdx % LANE_COLOR_COUNT}-${theme.id})`
            : undefined;

        // The tip stops at the face, not under it.
        const arrivalY = arrow ? mid - nodeExtent(theme) - ARROW_GAP : mid;

        if (edge.type === 'straight') {
          return (
            <line
              key={key}
              x1={from}
              y1={0}
              x2={from}
              y2={theme.rowHeight}
              stroke={color}
              strokeWidth={theme.strokeWidth}
            />
          );
        }

        const [startX, startY, endX, endY] =
          edge.type === 'branch' ? [from, 0, to, arrivalY] : [from, mid, to, theme.rowHeight];

        /**
         * A lane that does not change column is a plain segment whatever the
         * style — curving or cornering a straight line only adds artefacts.
         *
         * It still takes the marker. In a linear history EVERY arriving edge is
         * same-lane, so skipping it here is skipping arrowheads entirely for
         * the repos most likely to be looked at.
         */
        if (startX === endX) {
          return (
            <line
              key={key}
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke={color}
              strokeWidth={theme.strokeWidth}
              markerEnd={arrow}
            />
          );
        }

        return (
          <path
            key={key}
            d={edgePath(theme, startX, startY, endX, endY)}
            fill="none"
            stroke={color}
            strokeWidth={theme.strokeWidth}
            strokeLinejoin="round"
            markerEnd={arrow}
          />
        );
      })}

      {/*
        The node last so it sits above every edge — a merge line arriving at the
        same point would otherwise paint over it.

        A `dot` style draws a merge commit HOLLOW: at 3.5px that is the one
        distinction still legible, and it is what `git log --graph` readers
        already expect. The avatar styles cannot make it — the node is a face,
        and there is no inside left to empty out.
      */}
      {theme.node === 'avatar' ? (
        <CommitAvatar
          email={row.commit.authorEmail}
          name={row.commit.authorName}
          cx={nodeX}
          cy={mid}
          size={theme.avatarSize}
          ring={nodeColor}
          ringWidth={theme.ringWidth}
          clipId={clipId}
        />
      ) : (
        <circle
          cx={nodeX}
          cy={mid}
          r={theme.nodeRadius}
          fill={row.commit.parents.length > 1 ? 'hsl(var(--background))' : nodeColor}
          stroke={nodeColor}
          strokeWidth={theme.strokeWidth}
        />
      )}
    </svg>
  );
}

/**
 * The path for a lane that changes column.
 *
 * `bezier` — a cubic with vertical control points, so the lane leaves and
 * arrives parallel to the segments above and below and a branch reads as one
 * continuous line through the rows.
 *
 * `orthogonal` — vertical, a quadratic corner, horizontal, a second corner,
 * vertical. Emitted as ONE path rather than three strokes so the joins are
 * continuous; three separate elements meeting at right angles leave visible
 * notches at any stroke width above a hairline.
 *
 * `straight` — the direct diagonal.
 */
export function edgePath(
  theme: GraphTheme,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): string {
  if (theme.edge === 'straight') {
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  if (theme.edge === 'bezier') {
    const controlY = (startY + endY) / 2;
    return `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`;
  }

  // Orthogonal. The corner radius cannot exceed half the run in either axis, or
  // the two arcs overlap and the path folds back on itself.
  const dx = endX - startX;
  const dy = endY - startY;
  const r = Math.max(0, Math.min(theme.cornerRadius, Math.abs(dx) / 2, Math.abs(dy) / 2));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const turnY = (startY + endY) / 2;

  return [
    `M ${startX} ${startY}`,
    `L ${startX} ${turnY - r * sy}`,
    `Q ${startX} ${turnY}, ${startX + r * sx} ${turnY}`,
    `L ${endX - r * sx} ${turnY}`,
    `Q ${endX} ${turnY}, ${endX} ${turnY + r * sy}`,
    `L ${endX} ${endY}`,
  ].join(' ');
}
