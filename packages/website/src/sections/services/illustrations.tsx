import type { CSSProperties } from 'react';

import { useReducedMotion } from '../../components';

/*
  The three row illustrations, drawn rather than photographed — and, since this
  pass, each one showing its mechanism happening rather than stopped.

  **Why SVG and not a screenshot.** Each row is about a mechanism — a card that
  runs an agent, a check that is still running, five surfaces in one frame — and
  a screenshot of that mechanism is mostly chrome: title bars, real branch
  names, a scrollbar, whatever tab happened to be open. A drawing can show only
  the part being claimed, and it stays true when the UI moves.

  **Every colour is a token**, so both themes come for free: `--ws-bg-sunken`
  and `--ws-border` for the frame, `--ws-lane-*` for anything the copy points
  at, `--ws-rainbow-*` for the one surface that is meant to be the site's ramp.
  There is no hex in this file and no `dark:` prefix either.

  ── Why the motion is CSS keyframes ──────────────────────────────────────────

  The two moving parts this file had were SMIL — an `<animate>` on an agent dot
  and an `<animateTransform>` on a spinner — and SMIL was the right call for the
  requirement it was written against: an SVG animation is exactly the kind the
  CSS half of the motion policy cannot reach, so gating is "do not render the
  element", which `useReducedMotion()` does.

  It is not enough for the second requirement. A loop also has to stop when the
  tab is hidden, and the site does that in CSS: `page-visibility.ts` mirrors
  `document.hidden` onto the root element and `site.css` pauses every infinite
  animation under `html[data-page-hidden='true']`. No selector can pause a SMIL
  timeline — `animation-play-state` does not apply to one — so a loop written in
  SMIL keeps running in a tab nobody is looking at. Every loop below is
  therefore a keyframe animation, declared in `site.css` and listed in that
  rule; each takes its period from a custom property set here, so the drawing
  and its timing are described in one place.

  Both gates still apply: `useReducedMotion()` renders the *final* frame of each
  sequence with no animated class on it — the card already in Done, the checks
  already green, the panes already lit — rather than a slower version of the
  loop.
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

/** How long one full pass of an illustration takes. */
const KANBAN_MS = 12000;
const CHECKS_MS = 12000;
const WINDOW_MS = 10000;

/** A card body: the rounded rect plus two text lines. */
const Card = ({ x, y, accent }: { x: number; y: number; accent?: string }) => (
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

/** The three columns' left edges, and how far the travelling card moves. */
const COLUMNS = [16, 120, 224] as const;

/**
 * Automate Kanban: a card crossing the board, picking up an agent on the way.
 *
 * The loop is the claim: a card sits in **Todo** as a plain outline, moves to
 * **In progress** where it takes the site's rainbow border and neon pulse —
 * which is the app's own "an agent is working in here" — and then to **Done**,
 * where the border turns emerald and a tick lands in its top-right corner.
 * Then it leaves and the next one starts.
 *
 * One card is in motion at a time and the column headers never move, so the
 * board stays readable while the card is the only thing to follow. The
 * blocked-by chain underneath is static: it is a second claim, not a second
 * animation.
 */
export const KanbanArt = () => {
  const reduced = useReducedMotion();
  const rampId = 'ws-kanban-ramp';
  /** Where the card rests in the still frame: Done, finished. */
  const restX = COLUMNS[2] - COLUMNS[0];

  return (
    <svg
      viewBox="0 0 320 200"
      {...svgProps}
      data-testid="kanban-art"
      data-animated={!reduced}
      style={{ '--ws-kanban-loop': `${KANBAN_MS}ms` } as CSSProperties}
      aria-label="Three board columns — Todo, In progress and Done. A card crosses them: plain in Todo, outlined in the site's rainbow with a lit glow and a terminal inside it while an agent works on it in In progress, then green with a tick in Done. Underneath, the same items are drawn as a chain of blocked-by dependencies."
    >
      <defs>
        {/*
          The rainbow border, from the site's own ramp tokens rather than from
          six colours retyped here — the same six `.ws-rainbow-text` and the
          primary button are drawn from, so the "an agent has this" signal is
          the same signal everywhere on the page.
        */}
        <linearGradient id={rampId} x1="0" y1="0" x2="1" y2="1">
          {[0, 1, 2, 3, 4, 5, 0].map((stop, index) => (
            <stop
              key={index}
              offset={`${(index / 6) * 100}%`}
              stopColor={`var(--ws-rainbow-${stop})`}
            />
          ))}
        </linearGradient>
      </defs>

      <rect x={0.5} y={0.5} width={319} height={199} rx={12} {...FRAME} />

      {/* The columns: a header bar each, and the cards that are not moving. */}
      {COLUMNS.map((x, column) => (
        <g key={x}>
          <rect x={x} y={20} width={80} height={6} rx={3} fill="var(--ws-border-strong)" />
          {column !== 1 ? <Card x={x} y={34} /> : null}
        </g>
      ))}

      {/*
        The travelling card. Everything inside it is drawn at the Todo column's
        coordinates; the group's transform is what puts it in a column, so the
        three states cannot drift apart from the card they belong to.
      */}
      <g
        className={reduced ? undefined : 'ws-kanban-card'}
        transform={reduced ? `translate(${restX} 0)` : undefined}
        data-testid="kanban-card"
      >
        <rect
          x={COLUMNS[0]}
          y={70}
          width={80}
          height={44}
          rx={5}
          fill="var(--ws-bg-elevated)"
        />
        <rect x={COLUMNS[0] + 8} y={79} width={46} height={4} rx={2} fill="var(--ws-fg-subtle)" />
        <rect
          x={COLUMNS[0] + 8}
          y={88}
          width={30}
          height={3}
          rx={1.5}
          fill="var(--ws-border-strong)"
        />

        {/* The agent's terminal, inside the card, only while it is in progress. */}
        <g
          className={reduced ? undefined : 'ws-kanban-term'}
          opacity={reduced ? 0 : undefined}
          data-testid="kanban-terminal"
        >
          <rect
            x={COLUMNS[0] + 6}
            y={96}
            width={68}
            height={14}
            rx={3}
            fill="var(--ws-bg-sunken)"
          />
          <rect
            x={COLUMNS[0] + 11}
            y={100}
            width={20}
            height={2.5}
            rx={1.25}
            fill="var(--ws-lane-2)"
          />
          <rect
            x={COLUMNS[0] + 11}
            y={105}
            width={40}
            height={2.5}
            rx={1.25}
            fill="var(--ws-fg-subtle)"
          />
        </g>

        {/* Todo: a plain outline, and the only state present at rest. */}
        <rect
          className={reduced ? undefined : 'ws-kanban-todo'}
          x={COLUMNS[0]}
          y={70}
          width={80}
          height={44}
          rx={5}
          fill="none"
          stroke="var(--ws-border-strong)"
          strokeWidth={1}
          opacity={reduced ? 0 : undefined}
          data-testid="kanban-todo"
        />

        {/* In progress: the rainbow border, lit — an agent has picked it up. */}
        <rect
          className={reduced ? undefined : 'ws-kanban-doing ws-svg-neon'}
          x={COLUMNS[0]}
          y={70}
          width={80}
          height={44}
          rx={5}
          fill="none"
          stroke={`url(#${rampId})`}
          strokeWidth={1.8}
          opacity={reduced ? 0 : undefined}
          data-testid="kanban-doing"
        />

        {/* Done: emerald, and a tick in the corner. */}
        <rect
          className={reduced ? undefined : 'ws-kanban-done'}
          x={COLUMNS[0]}
          y={70}
          width={80}
          height={44}
          rx={5}
          fill="none"
          stroke="var(--ws-lane-2)"
          strokeWidth={1.8}
          opacity={reduced ? 1 : undefined}
          data-testid="kanban-done"
        />
        <g
          className={reduced ? undefined : 'ws-kanban-check'}
          opacity={reduced ? 1 : undefined}
          data-testid="kanban-check"
        >
          <circle cx={COLUMNS[0] + 72} cy={78} r={7} fill="var(--ws-lane-2)" />
          <path
            d={`M${COLUMNS[0] + 68.5} 78 l 2.5 2.5 l 4.5 -5`}
            fill="none"
            stroke="var(--ws-bg-sunken)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>

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

/** A check run's dot, in one of its four states. All four are the same disc. */
const CheckDot = ({
  y,
  tint,
  hollow = false,
  tick = false,
}: {
  y: number;
  tint: string;
  hollow?: boolean;
  tick?: boolean;
}) => (
  <>
    <circle
      cx={30}
      cy={y}
      r={5}
      fill={hollow ? 'var(--ws-bg-sunken)' : tint}
      stroke={tint}
      strokeWidth={hollow ? 1.6 : 0}
    />
    {tick ? (
      <path
        d={`M27.5 ${y} l 2 2 l 3.5 -4`}
        fill="none"
        stroke="var(--ws-bg-sunken)"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    ) : null}
  </>
);

/**
 * Track CI and manage reviews: the checks going green, and a review turning.
 *
 * Three check runs tick over in order — pending, running, passed — and the
 * third one fails first, which is the whole point of the row: a red check is
 * an ordinary event that a new commit clears. The new commit's dot lands beside
 * the pull request just before the third check goes green, and the review badge
 * flips from "changes requested" to "approved" behind it.
 *
 * The states are stacked rather than swapped: pending is painted first and each
 * later state is an opaque disc over it, so a state can only ever fade *in*.
 * Nothing has to be hidden in the right order for the picture to be correct.
 */
export const ChecksArt = () => {
  const reduced = useReducedMotion();
  const cls = (name: string) => (reduced ? undefined : name);
  /** In the still frame every check has finished and the review is approved. */
  const settled = (final: boolean) => (reduced ? (final ? 1 : 0) : undefined);

  return (
    <svg
      viewBox="0 0 320 200"
      {...svgProps}
      data-testid="checks-art"
      data-animated={!reduced}
      style={{ '--ws-checks-loop': `${CHECKS_MS}ms` } as CSSProperties}
      aria-label="A pull request with three check runs going green in turn — the third failing first and cleared by a new commit — above a review thread whose badge flips from changes requested to approved."
    >
      <rect x={0.5} y={0.5} width={319} height={199} rx={12} {...FRAME} />

      {/* The pull request's own row. */}
      <rect x={16} y={16} width={288} height={26} rx={6} fill="var(--ws-bg-elevated)" />
      <circle cx={30} cy={29} r={5} fill="none" stroke="var(--ws-lane-3)" strokeWidth={1.5} />
      <rect x={44} y={26} width={140} height={5} rx={2.5} fill="var(--ws-fg-muted)" />

      {/* The commit that fixes the failing check, landing on the PR row. */}
      <g
        className={cls('ws-ci-commit')}
        opacity={settled(true)}
        data-testid="checks-new-commit"
      >
        <circle cx={206} cy={29} r={4} fill="var(--ws-lane-1)" />
        <rect x={216} y={27} width={24} height={4} rx={2} fill="var(--ws-fg-subtle)" />
      </g>

      {/* The review badge, one state over the other. */}
      <g data-testid="checks-review-badge">
        <rect
          className={cls('ws-ci-changes')}
          x={252}
          y={24}
          width={40}
          height={10}
          rx={5}
          fill="var(--ws-lane-4)"
          opacity={settled(false)}
          data-testid="checks-changes"
        />
        <rect
          className={cls('ws-ci-approved')}
          x={252}
          y={24}
          width={40}
          height={10}
          rx={5}
          fill="var(--ws-lane-2)"
          opacity={settled(true)}
          data-testid="checks-approved"
        />
      </g>

      {/* Three check runs, each a stack of states over one pending disc. */}
      {[
        { y: 61, width: 96, run: 'ws-ci-run-1', pass: 'ws-ci-pass-1', fail: null },
        { y: 83, width: 120, run: 'ws-ci-run-2', pass: 'ws-ci-pass-2', fail: null },
        { y: 105, width: 72, run: 'ws-ci-run-3', pass: 'ws-ci-pass-3', fail: 'ws-ci-fail-3' },
      ].map(({ y, width, run, pass, fail }) => (
        <g key={y}>
          {/* Pending: a grey disc, always painted, always underneath. */}
          <circle cx={30} cy={y} r={5} fill="var(--ws-border-strong)" />

          {fail ? (
            <g className={cls(fail)} opacity={settled(false)} data-testid="checks-failing">
              <CheckDot y={y} tint="var(--ws-lane-5)" />
              <path
                d={`M27.5 ${y - 2.5} l 5 5 M32.5 ${y - 2.5} l -5 5`}
                stroke="var(--ws-bg-sunken)"
                strokeWidth={1.4}
                strokeLinecap="round"
              />
            </g>
          ) : null}

          {/* Running: the lane colour, breathing. */}
          <g
            className={reduced ? undefined : `${run} ws-ci-throb`}
            opacity={settled(false)}
            data-testid="checks-running"
          >
            <CheckDot y={y} tint="var(--ws-lane-1)" hollow />
          </g>

          {/* Passed: emerald, with a tick. */}
          <g className={cls(pass)} opacity={settled(true)} data-testid="checks-passed">
            <CheckDot y={y} tint="var(--ws-lane-2)" tick />
          </g>

          <rect x={44} y={y - 2} width={width} height={4} rx={2} fill="var(--ws-fg-subtle)" />
        </g>
      ))}

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
 * One window: the rail, the graph, the browser, the API client and the shell.
 *
 * The claim is that these are panes rather than applications, so the loop lights
 * them in turn — the graph draws a lane, the shell types a prompt line, the
 * browser gains a tab, the API client's request comes back green — and then
 * holds with all four lit. One pane at a time, about a second and a half apart:
 * the point is that they are in one frame, and four things moving at once would
 * say the opposite.
 */
export const WindowArt = () => {
  const reduced = useReducedMotion();
  const cls = (name: string) => (reduced ? undefined : name);

  return (
    <svg
      viewBox="0 0 320 200"
      {...svgProps}
      data-testid="window-art"
      data-animated={!reduced}
      style={{ '--ws-window-loop': `${WINDOW_MS}ms` } as CSSProperties}
      aria-label="One application window: a nav rail down the left, a commit graph whose lanes draw themselves in coloured strokes, a docked browser that gains a tab, an HTTP request that comes back green and a terminal beneath them typing a prompt line."
    >
      <rect x={0.5} y={0.5} width={319} height={199} rx={12} {...FRAME} />

      {/* Title bar. */}
      <path
        d="M0 12 a12 12 0 0 1 12 -12 h296 a12 12 0 0 1 12 12 v10 h-320 z"
        fill="var(--ws-bg-elevated)"
      />
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

      {/*
        The graph, in lanes. `pathLength="1"` normalises each path, so one dash
        length draws any of them and the stagger is a delay rather than three
        different numbers.
      */}
      <g strokeWidth={1.5} fill="none" data-testid="window-lanes">
        {[
          { d: 'M56 40 V 150', stroke: 'var(--ws-lane-1)', delay: 0 },
          { d: 'M56 62 C 56 76, 72 72, 72 86 V 150', stroke: 'var(--ws-lane-2)', delay: 240 },
          { d: 'M56 96 C 56 110, 88 106, 88 120 V 150', stroke: 'var(--ws-lane-3)', delay: 480 },
        ].map(({ d, stroke, delay }) => (
          <path
            key={d}
            className={cls('ws-win-draw')}
            style={reduced ? undefined : { animationDelay: `${delay}ms` }}
            d={d}
            pathLength={1}
            stroke={stroke}
          />
        ))}
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
      <rect x={112} y={34} width={196} height={70} rx={8} fill="var(--ws-bg-elevated)" />
      <rect x={120} y={42} width={40} height={10} rx={5} fill="var(--ws-accent-soft)" />
      <rect
        className={cls('ws-win-tab')}
        x={164}
        y={42}
        width={34}
        height={10}
        rx={5}
        fill="var(--ws-bg-sunken)"
        opacity={reduced ? 1 : undefined}
        data-testid="window-tab"
      />
      <rect x={120} y={60} width={180} height={9} rx={4.5} fill="var(--ws-bg-sunken)" />
      <rect x={120} y={78} width={120} height={5} rx={2.5} fill="var(--ws-border-strong)" />
      <rect x={120} y={90} width={160} height={5} rx={2.5} fill="var(--ws-border-strong)" />

      {/* The API client: a method, a path, and the status it came back with. */}
      <g data-testid="window-request">
        <rect x={112} y={110} width={196} height={20} rx={6} fill="var(--ws-bg-elevated)" />
        <rect x={120} y={117} width={18} height={6} rx={3} fill="var(--ws-lane-3)" />
        <rect x={144} y={118} width={104} height={4} rx={2} fill="var(--ws-fg-subtle)" />
        <rect x={272} y={116} width={26} height={8} rx={4} fill="var(--ws-border-strong)" />
        <rect
          className={cls('ws-win-ok')}
          x={272}
          y={116}
          width={26}
          height={8}
          rx={4}
          fill="var(--ws-lane-2)"
          opacity={reduced ? 1 : undefined}
          data-testid="window-status-ok"
        />
      </g>

      {/* The shell under it, typing. */}
      <rect
        x={112}
        y={136}
        width={196}
        height={56}
        rx={8}
        fill="var(--ws-bg-sunken)"
        stroke="var(--ws-border)"
      />
      <rect x={122} y={148} width={8} height={4} rx={2} fill="var(--ws-lane-2)" />
      <rect
        className={cls('ws-win-type')}
        x={136}
        y={148}
        width={92}
        height={4}
        rx={2}
        fill="var(--ws-fg-subtle)"
        data-testid="window-prompt"
      />
      <rect x={122} y={162} width={140} height={4} rx={2} fill="var(--ws-border-strong)" />
      <rect x={122} y={176} width={8} height={4} rx={2} fill="var(--ws-lane-2)" />
      <rect x={136} y={176} width={60} height={4} rx={2} fill="var(--ws-fg-subtle)" />
    </svg>
  );
};
