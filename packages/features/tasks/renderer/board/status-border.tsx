import type { StatusStroke } from '../status-stroke';

/** Outer corner radius of a card (Tailwind `rounded`, 0.25rem). */
const CARD_RADIUS_PX = 4;

/** How far a list row's rule sits in from the row's left edge and its ends. */
const RULE_INSET_PX = 4;

/**
 * A card's status border, drawn as an SVG rect over the card's own
 * (transparent) border. Only an SVG stroke can march its dashes, and drawing
 * it in SVG gives it the same `stroke-dasharray` and keyframe the graph edge
 * uses, so the two match exactly.
 *
 * The host needs `position: relative` and a transparent border `stroke.width`
 * wide. The SVG covers the host's border box, and the rect sits on the
 * centre line of that border.
 */
export function StatusBorder({
  stroke,
  offscreen = false,
}: {
  stroke: StatusStroke;
  offscreen?: boolean;
}) {
  const w = stroke.width;
  return (
    <svg
      aria-hidden
      data-status-border={stroke.kind}
      data-blocked={stroke.blocked ? '' : undefined}
      data-offscreen={offscreen ? '' : undefined}
      className="status-border"
      style={{
        left: -w,
        top: -w,
        width: `calc(100% + ${2 * w}px)`,
        height: `calc(100% + ${2 * w}px)`,
      }}
    >
      <rect
        className={`status-border-rect${stroke.animated ? ' status-stroke-animated' : ''}`}
        x={w / 2}
        y={w / 2}
        rx={CARD_RADIUS_PX - w / 2}
        style={{ width: `calc(100% - ${w}px)`, height: `calc(100% - ${w}px)` }}
        stroke={stroke.color}
        strokeWidth={w}
        strokeOpacity={stroke.opacity}
        strokeDasharray={stroke.dashArray ?? undefined}
      />
    </svg>
  );
}

/**
 * A list row's status stroke: a vertical rule down the row's left edge, the
 * same colour, dash, opacity and keyframe as a card's `StatusBorder`. A full
 * outline around every 32px row would turn the table into a stack of boxes;
 * a left rule reads as the same signal while keeping the rows a list.
 *
 * Absolutely positioned in the row's left padding, so it needs a
 * `position` on the host and takes no layout space. Rows are virtualised, so
 * an off-screen row is unmounted and needs no `data-offscreen` gate.
 */
export function StatusRule({ stroke }: { stroke: StatusStroke }) {
  const w = stroke.width;
  return (
    <svg
      aria-hidden
      data-status-border={stroke.kind}
      data-blocked={stroke.blocked ? '' : undefined}
      className="status-border status-rule"
      // Inset from the row's own edge and ends, so it reads as a rule on
      // the row rather than a line along the table's border.
      style={{ left: RULE_INSET_PX, top: RULE_INSET_PX, width: w, height: `calc(100% - ${2 * RULE_INSET_PX}px)` }}
    >
      <line
        className={`status-border-rect${stroke.animated ? ' status-stroke-animated' : ''}`}
        x1={w / 2}
        x2={w / 2}
        y1={0}
        y2="100%"
        stroke={stroke.color}
        strokeWidth={w}
        strokeOpacity={stroke.opacity}
        strokeDasharray={stroke.dashArray ?? undefined}
      />
    </svg>
  );
}
