import type { StatusStroke } from '../status-stroke';

/** Outer corner radius of a card (Tailwind `rounded`, 0.25rem). */
const CARD_RADIUS_PX = 4;

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
        strokeDasharray={stroke.dashArray ?? undefined}
      />
    </svg>
  );
}
