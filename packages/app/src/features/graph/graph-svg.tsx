import type { GraphRow } from '@midnite-git/shared';

import { laneColor } from './lane-colors';

/**
 * One row's worth of graph, as an SVG.
 *
 * SVG-per-row inside a virtualized list, rather than one big canvas or one tall
 * SVG, because it is what makes the graph a normal part of the DOM: rows are
 * hit-testable, can be drop targets for the drag gestures in Phase 8, and are
 * reachable by keyboard and screen readers. A canvas would need all of that
 * rebuilt by hand. It's also the approach VS Code's own SCM graph settled on.
 *
 * The geometry follows the edge types directly, which is why they encode which
 * half of the row they occupy (see GraphEdgeType in shared):
 *
 *   straight  top edge → bottom edge, one lane
 *   branch    top edge → the node (upper half)
 *   merge     the node → bottom edge (lower half)
 */
export const ROW_HEIGHT = 26;
export const LANE_WIDTH = 14;
const NODE_RADIUS = 3.5;
const STROKE = 1.75;

/** Horizontal centre of a lane. */
const x = (lane: number): number => lane * LANE_WIDTH + LANE_WIDTH / 2;

export function GraphSvg({ row, width }: { row: GraphRow; width: number }) {
  const mid = ROW_HEIGHT / 2;
  const nodeX = x(row.lane);

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      className="shrink-0 overflow-visible"
      // Decorative: the row's text already carries the commit's identity, and a
      // screen reader announcing lane geometry would be noise.
      aria-hidden
    >
      {row.edges.map((edge, index) => {
        const color = laneColor(edge.colorIdx);
        const from = x(edge.fromLane);
        const to = x(edge.toLane);
        const key = `${edge.type}-${edge.fromLane}-${edge.toLane}-${index}`;

        if (edge.type === 'straight') {
          return (
            <line
              key={key}
              x1={from}
              y1={0}
              x2={from}
              y2={ROW_HEIGHT}
              stroke={color}
              strokeWidth={STROKE}
            />
          );
        }

        // A lane that changes column curves rather than turning a corner: a
        // cubic with vertical control points leaves and arrives parallel to the
        // neighbouring segments, so a branch reads as one continuous line
        // through the rows above and below.
        const [startX, startY, endX, endY] =
          edge.type === 'branch' ? [from, 0, to, mid] : [from, mid, to, ROW_HEIGHT];

        if (startX === endX) {
          return (
            <line
              key={key}
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke={color}
              strokeWidth={STROKE}
            />
          );
        }

        const controlY = (startY + endY) / 2;
        return (
          <path
            key={key}
            d={`M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
          />
        );
      })}

      {/*
        The node last so it sits above every edge — a merge line arriving at the
        same point would otherwise paint over it.
        A merge commit is drawn hollow: it's the one distinction worth making at
        this size, and it matches what `git log --graph` readers already expect.
      */}
      <circle
        cx={nodeX}
        cy={mid}
        r={NODE_RADIUS}
        fill={row.commit.parents.length > 1 ? 'hsl(var(--background))' : laneColor(row.colorIdx)}
        stroke={laneColor(row.colorIdx)}
        strokeWidth={STROKE}
      />
    </svg>
  );
}
