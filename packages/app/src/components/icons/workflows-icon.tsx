import type { CSSProperties } from 'react';

type Edge = 'top' | 'right' | 'bottom' | 'left';

/** Box side, corner radius, and half the length of the gap a node cuts in an edge. */
const SIDE = 8;
const CORNER = 1.75;
const GAP_HALF = 2;
/** Radius of a node dot. */
const NODE_R = 1.35;

/**
 * One step's outline: a rounded square at (`x`, `y`) with a gap centred on
 * each edge in `gaps`, as a single open path.
 *
 * The gaps are real breaks in the path, not a mask: a mask needs a per-
 * instance id, and an id that changes per render makes two renders of the
 * same mark differ — which `sidebar-page.test.tsx` compares outright. The
 * path starts on the far side of the first gap, walks clockwise and ends on
 * its near side, so the stroke has no seam anywhere else.
 */
export function stepPath(x: number, y: number, gaps: readonly Edge[]): string {
  const r = CORNER;
  const s = SIDE;
  // Clockwise: each edge's start, end, and the corner arc that follows it.
  const edges: Array<{ edge: Edge; from: [number, number]; to: [number, number]; arc: [number, number] }> = [
    { edge: 'top', from: [x + r, y], to: [x + s - r, y], arc: [x + s, y + r] },
    { edge: 'right', from: [x + s, y + r], to: [x + s, y + s - r], arc: [x + s - r, y + s] },
    { edge: 'bottom', from: [x + s - r, y + s], to: [x + r, y + s], arc: [x, y + s - r] },
    { edge: 'left', from: [x, y + s - r], to: [x, y + r], arc: [x + r, y] },
  ];
  const pt = ([px, py]: [number, number]) => `${+px.toFixed(3)} ${+py.toFixed(3)}`;
  const gapEnds = (e: (typeof edges)[number]): [[number, number], [number, number]] => {
    const mx = (e.from[0] + e.to[0]) / 2;
    const my = (e.from[1] + e.to[1]) / 2;
    const dx = Math.sign(e.to[0] - e.from[0]) * GAP_HALF;
    const dy = Math.sign(e.to[1] - e.from[1]) * GAP_HALF;
    return [
      [mx - dx, my - dy],
      [mx + dx, my + dy],
    ];
  };
  const arc = (e: (typeof edges)[number]) => `A ${r} ${r} 0 0 1 ${pt(e.arc)}`;

  const first = edges.findIndex((e) => gaps.includes(e.edge));
  if (first === -1) {
    return `M ${pt(edges[0]!.from)} ${edges.map((e) => `L ${pt(e.to)} ${arc(e)}`).join(' ')} Z`;
  }
  const head = edges[first]!;
  const [nearFirst, farFirst] = gapEnds(head);
  const parts = [`M ${pt(farFirst)} L ${pt(head.to)} ${arc(head)}`];
  for (let step = 1; step < 4; step += 1) {
    const e = edges[(first + step) % 4]!;
    if (gaps.includes(e.edge)) {
      const [near, far] = gapEnds(e);
      parts.push(`L ${pt(near)} M ${pt(far)} L ${pt(e.to)} ${arc(e)}`);
    } else {
      parts.push(`L ${pt(e.to)} ${arc(e)}`);
    }
  }
  parts.push(`L ${pt(nearFirst)}`);
  return parts.join(' ');
}

/** Precomputed once — the mark is static, so its geometry is too. */
const STEPS = {
  topLeft: stepPath(2, 2, ['right']),
  topRight: stepPath(14, 2, ['left', 'bottom']),
  bottomLeft: stepPath(2, 14, ['right']),
  bottomRight: stepPath(14, 14, ['top', 'left']),
};

/**
 * The Workflows mark: four rounded boxes, each a step, wired edge to edge by
 * a node pair and a short connector — top-left → top-right → bottom-right ←
 * bottom-left. The top-right step and its two nodes are the accent: the step
 * a run is on.
 *
 * Drawn from the app's own diagram rather than taken from a set, so it is a
 * hand-held mark beside the set glyphs (CLAUDE.md), matching the structural
 * `IconComponent` type the way `CirclePileIcon` does.
 *
 * - The steps stroke in `currentColor` on Lucide's 24-unit grid, so the mark
 *   sits beside `react-icons/lu` glyphs at rail size.
 * - The accent is `var(--workflows-icon-accent, hsl(var(--primary)))`, so a
 *   caller can retint it — or set it to `currentColor` for a monochrome mark.
 * - Where a node meets its step, the step's edge is broken (`stepPath`), so
 *   the node reads as a port on the edge rather than a dot on top of it.
 */
export function WorkflowsIcon({
  className,
  strokeWidth = 1.75,
  style,
}: {
  className?: string;
  /** `string | number`, matching react-icons' `IconBaseProps` — see `CirclePileIcon`. */
  strokeWidth?: number | string;
  style?: CSSProperties;
}) {
  const accent = 'var(--workflows-icon-accent, hsl(var(--primary)))';
  const node = (cx: number, cy: number, fill: string) => (
    <circle cx={cx} cy={cy} r={NODE_R} fill={fill} stroke="none" />
  );

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="butt"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon="workflows"
    >
      {/* Connectors — drawn first, quieter than the steps they join. */}
      <g strokeWidth={1} strokeOpacity={0.55}>
        <path d="M10 6 H14" />
        <path d="M18 10 V14" />
        <path d="M10 18 H14" />
      </g>

      <path d={STEPS.topLeft} data-step="" />
      <path d={STEPS.topRight} stroke={accent} data-step="" data-accent="" />
      <path d={STEPS.bottomLeft} data-step="" />
      <path d={STEPS.bottomRight} data-step="" />

      {node(10, 6, 'currentColor')}
      {node(14, 6, accent)}
      {node(18, 10, accent)}
      {node(18, 14, 'currentColor')}
      {node(10, 18, 'currentColor')}
      {node(14, 18, 'currentColor')}
    </svg>
  );
}
