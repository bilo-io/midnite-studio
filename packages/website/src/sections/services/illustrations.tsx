import { useReducedMotion } from '../../components';

/*
  The three row illustrations, drawn rather than photographed.

  **Why SVG and not a screenshot.** Each row is about a mechanism — a card that
  runs an agent, a check that is still running, five surfaces in one frame — and
  a screenshot of that mechanism is mostly chrome: title bars, real branch
  names, a scrollbar, whatever tab happened to be open. A drawing can show only
  the part being claimed, and it stays true when the UI moves.

  **Every colour is a token**, so both themes come for free: `--ws-bg-sunken`
  and `--ws-border` for the frame, `--ws-lane-*` for anything the copy points
  at. There is no hex in this file and no `dark:` prefix either.

  **Motion is SMIL, and gated.** The two moving parts — an agent dot that
  breathes, a check that spins — are `<animate>` / `<animateTransform>`
  elements, so they need no keyframe in the site's stylesheet and no library.
  They are rendered only when `useReducedMotion()` is false: an SVG animation
  is exactly the kind the CSS half of the motion policy cannot reach, since
  zeroing a duration token does not touch SMIL.
*/

const FRAME = {
  fill: 'var(--ws-bg-sunken)',
  stroke: 'var(--ws-border)',
} as const;

/** Shared props: the row decides the size, the drawing fills it. */
const svgProps = {
  className: 'size-full',
  role: 'img' as const,
  preserveAspectRatio: 'xMidYMid meet',
};

/** A card body: the rounded rect plus two text lines. */
const Card = ({
  x,
  y,
  accent,
}: {
  x: number;
  y: number;
  accent?: string;
}) => (
  <g>
    <rect
      x={x}
      y={y}
      width={80}
      height={30}
      rx={5}
      fill="var(--ws-bg-elevated)"
      stroke={accent ?? 'var(--ws-border)'}
      strokeWidth={accent ? 1.5 : 1}
    />
    <rect x={x + 8} y={y + 8} width={46} height={4} rx={2} fill="var(--ws-fg-subtle)" />
    <rect x={x + 8} y={y + 17} width={30} height={4} rx={2} fill="var(--ws-border-strong)" />
  </g>
);

/**
 * Automate Kanban: three columns, and one card with an agent running in it.
 */
export const KanbanArt = () => {
  const reduced = useReducedMotion();

  return (
    <svg
      viewBox="0 0 320 200"
      {...svgProps}
      aria-label="Three board columns. A card in the middle column is outlined in green with a live dot and a terminal inside it, an arrow shows a card being dragged into it, and underneath the same items are drawn as a chain of blocked-by dependencies."
    >
      <rect x={0.5} y={0.5} width={319} height={199} rx={12} {...FRAME} />

      {[16, 120, 224].map((x, column) => (
        <g key={x}>
          <rect x={x} y={20} width={80} height={6} rx={3} fill="var(--ws-border-strong)" />
          <Card x={x} y={38} />
          {column !== 1 ? <Card x={x} y={78} /> : null}
        </g>
      ))}

      {/* The card an agent is running in. */}
      <Card x={120} y={78} accent="var(--ws-lane-2)" />
      <circle cx={192} cy={86} r={4} fill="var(--ws-lane-2)">
        {reduced ? null : (
          <animate
            attributeName="opacity"
            values="0.3;1;0.3"
            dur="2.4s"
            repeatCount="indefinite"
          />
        )}
      </circle>
      {/* Its terminal, inside the card. */}
      <rect x={128} y={108} width={64} height={22} rx={4} fill="var(--ws-bg-sunken)" />
      <rect x={134} y={114} width={28} height={3} rx={1.5} fill="var(--ws-lane-2)" />
      <rect x={134} y={121} width={44} height={3} rx={1.5} fill="var(--ws-fg-subtle)" />

      {/* The drag: a column boundary crossed, which is the field write. */}
      <path
        d="M96 55 C 108 55, 108 70, 118 70"
        fill="none"
        stroke="var(--ws-accent)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <path d="M118 70 l -6 -3 l 0 6 z" fill="var(--ws-accent)" />

      {/* Underneath: the same items as a blocked-by graph, left to right. */}
      <rect x={16} y={152} width={288} height={32} rx={6} fill="var(--ws-bg-elevated)" />
      <path
        d="M46 168 H 92 M118 168 H 164 M190 168 H 236"
        stroke="var(--ws-lane-4)"
        strokeWidth={1.5}
      />
      {[36, 105, 177, 250].map((cx) => (
        <circle
          key={cx}
          cx={cx}
          cy={168}
          r={6}
          fill="var(--ws-bg-sunken)"
          stroke="var(--ws-lane-4)"
          strokeWidth={1.5}
        />
      ))}
      <circle cx={284} cy={168} r={6} fill="var(--ws-lane-2)" />
    </svg>
  );
};

/**
 * Track CI and manage reviews: check runs, and a suggestion applied.
 */
export const ChecksArt = () => {
  const reduced = useReducedMotion();

  return (
    <svg
      viewBox="0 0 320 200"
      {...svgProps}
      aria-label="A pull request with three check runs — two passed, one still spinning — above a review thread whose suggested change is a green block."
    >
      <rect x={0.5} y={0.5} width={319} height={199} rx={12} {...FRAME} />

      {/* The pull request's own row. */}
      <rect x={16} y={16} width={288} height={26} rx={6} fill="var(--ws-bg-elevated)" />
      <circle cx={30} cy={29} r={5} fill="none" stroke="var(--ws-lane-3)" strokeWidth={1.5} />
      <rect x={44} y={26} width={140} height={5} rx={2.5} fill="var(--ws-fg-muted)" />
      <rect x={252} y={24} width={40} height={10} rx={5} fill="var(--ws-accent-soft)" />

      {/* Three check runs. */}
      {[
        { y: 56, tint: 'var(--ws-lane-2)', width: 96 },
        { y: 78, tint: 'var(--ws-lane-2)', width: 120 },
      ].map(({ y, tint, width }) => (
        <g key={y}>
          <circle cx={30} cy={y + 5} r={5} fill={tint} />
          <path
            d={`M27.5 ${y + 5} l 2 2 l 3.5 -4`}
            fill="none"
            stroke="var(--ws-bg-sunken)"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <rect x={44} y={y + 3} width={width} height={4} rx={2} fill="var(--ws-fg-subtle)" />
        </g>
      ))}
      <g>
        <circle
          cx={30}
          cy={105}
          r={5}
          fill="none"
          stroke="var(--ws-lane-4)"
          strokeWidth={2}
          strokeDasharray="6 5"
        >
          {reduced ? null : (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 30 105"
              to="360 30 105"
              dur="1.8s"
              repeatCount="indefinite"
            />
          )}
        </circle>
        <rect x={44} y={103} width={72} height={4} rx={2} fill="var(--ws-fg-subtle)" />
      </g>

      {/* A review thread, and the suggestion block you can apply. */}
      <rect x={16} y={126} width={288} height={58} rx={8} fill="var(--ws-bg-elevated)" />
      <circle cx={32} cy={142} r={6} fill="var(--ws-border-strong)" />
      <rect x={46} y={140} width={104} height={4} rx={2} fill="var(--ws-fg-subtle)" />
      <rect x={46} y={156} width={244} height={20} rx={4} fill="var(--ws-bg-sunken)" />
      <rect x={46} y={156} width={3} height={20} rx={1.5} fill="var(--ws-lane-2)" />
      <rect x={58} y={164} width={120} height={4} rx={2} fill="var(--ws-lane-2)" />
      <rect x={248} y={162} width={36} height={9} rx={4.5} fill="var(--ws-accent)" />
    </svg>
  );
};

/**
 * One window: the rail, the graph, the browser and the shell in one frame.
 */
export const WindowArt = () => (
  <svg
    viewBox="0 0 320 200"
    {...svgProps}
    aria-label="One application window: a nav rail down the left, a commit graph in coloured lanes, a docked browser pane and a terminal beneath it."
  >
    <rect x={0.5} y={0.5} width={319} height={199} rx={12} {...FRAME} />

    {/* Title bar. */}
    <path d="M0 12 a12 12 0 0 1 12 -12 h296 a12 12 0 0 1 12 12 v10 h-320 z" fill="var(--ws-bg-elevated)" />
    {['var(--ws-lane-4)', 'var(--ws-lane-2)', 'var(--ws-lane-1)'].map((fill, index) => (
      <circle key={fill} cx={16 + index * 12} cy={11} r={3.5} fill={fill} />
    ))}

    {/* The rail: one row per surface. */}
    <rect x={8} y={30} width={24} height={162} rx={8} fill="var(--ws-bg-elevated)" />
    {[42, 66, 90, 114, 138].map((y, index) => (
      <rect
        key={y}
        x={14}
        y={y}
        width={12}
        height={12}
        rx={3}
        fill={index === 0 ? 'var(--ws-accent)' : 'var(--ws-border-strong)'}
      />
    ))}

    {/* The graph, in lanes. */}
    <g strokeWidth={1.5} fill="none">
      <path d="M56 40 V 150" stroke="var(--ws-lane-1)" />
      <path d="M56 62 C 56 76, 72 72, 72 86 V 150" stroke="var(--ws-lane-2)" />
      <path d="M56 96 C 56 110, 88 106, 88 120 V 150" stroke="var(--ws-lane-3)" />
    </g>
    {[
      { cx: 56, cy: 48, fill: 'var(--ws-lane-1)' },
      { cx: 56, cy: 62, fill: 'var(--ws-lane-1)' },
      { cx: 72, cy: 90, fill: 'var(--ws-lane-2)' },
      { cx: 56, cy: 96, fill: 'var(--ws-lane-1)' },
      { cx: 88, cy: 124, fill: 'var(--ws-lane-3)' },
      { cx: 56, cy: 140, fill: 'var(--ws-lane-1)' },
    ].map(({ cx, cy, fill }) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill={fill} />
    ))}

    {/* The docked browser. */}
    <rect x={112} y={34} width={196} height={86} rx={8} fill="var(--ws-bg-elevated)" />
    <rect x={120} y={42} width={40} height={10} rx={5} fill="var(--ws-accent-soft)" />
    <rect x={164} y={42} width={34} height={10} rx={5} fill="var(--ws-bg-sunken)" />
    <rect x={120} y={60} width={180} height={9} rx={4.5} fill="var(--ws-bg-sunken)" />
    <rect x={120} y={78} width={120} height={5} rx={2.5} fill="var(--ws-border-strong)" />
    <rect x={120} y={92} width={160} height={5} rx={2.5} fill="var(--ws-border-strong)" />
    <rect x={120} y={106} width={92} height={5} rx={2.5} fill="var(--ws-border-strong)" />

    {/* The shell under it. */}
    <rect x={112} y={128} width={196} height={64} rx={8} fill="var(--ws-bg-sunken)" stroke="var(--ws-border)" />
    <rect x={122} y={140} width={8} height={4} rx={2} fill="var(--ws-lane-2)" />
    <rect x={136} y={140} width={92} height={4} rx={2} fill="var(--ws-fg-subtle)" />
    <rect x={122} y={154} width={140} height={4} rx={2} fill="var(--ws-border-strong)" />
    <rect x={122} y={168} width={8} height={4} rx={2} fill="var(--ws-lane-2)" />
    <rect x={136} y={168} width={60} height={4} rx={2} fill="var(--ws-fg-subtle)" />
  </svg>
);
