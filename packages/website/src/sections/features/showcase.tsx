import type { CSSProperties } from 'react';

import { GlowCard, useReducedMotion } from '../../components';

/*
  The commit graph, drawn — and, since this pass, arriving.

  **Why this replaced a screenshot crop.** What stood here was the one real app
  screenshot in `public/`, sized and offset in percentages so a portrait
  1080x1920 PNG showed its middle third as a 3:2 strip. That worked, and it cost
  ~0.5 MB of PNG to show four coloured lines: most of the pixels were window
  chrome, a scrollbar, and whichever branch names happened to be checked out on
  the day it was taken. A drawing shows only what the section is claiming — the
  lanes, the nodes, a merge, the ref you have checked out — and it stays true
  when the UI moves. It is also the style the Services rows already use
  (`sections/services/illustrations.tsx`), so the page has one visual language
  for "here is the mechanism" rather than two.

  The PNGs stay in `public/`: the hero's poster is the same asset.

  **Every colour is a token.** `--ws-lane-1..5` for the lanes, their edges and
  their nodes; `--ws-bg-*` / `--ws-border*` / `--ws-fg-*` for the frame and the
  commit rows. No hex, no `dark:` prefix — both themes come from the tokens the
  nav's theme switcher flips (`data-theme` / `.ws-auto-light`, see `theme.ts`),
  as they do for the rest of the page. That is a second reason the screenshot
  had to go: an `<img>` needs the resolved theme *in JS* to pick a file, which
  is a subscription the drawing simply does not have.

  ── How it moves, and why it can loop at all ──────────────────────────────────

  The brief was "history arriving": commits appearing at the top one at a time
  while the graph slides down and the oldest row leaves. The hard part of that
  is not the sliding, it is the *loop* — a finite list slid down by four rows
  has to get back to where it started, and a graph that jumps back up four rows
  every twelve seconds reads as a glitch, not as history.

  So the trick is the marquee's own (`sections/trusted/agent-marquee.tsx`): the
  list is rendered `COPIES` times, stacked upwards, and the group slides down by
  **exactly one copy's height**. At the end of the pass copy `c` is sitting
  precisely where copy `c−1` began, so the last frame of the loop is the first
  frame of the next one, pixel for pixel. There is no reset to hide.

  Two consequences are worth stating, because both look like bugs otherwise:

  - **The oldest commit gets an edge that goes nowhere.** Across the seam, the
    oldest row of one copy sits directly above the newest row of the next, and
    without a stub the trunk line would break there once per copy. `ROOT_STUB`
    draws one pitch of trunk below the root, which joins them — and is exactly
    what an infinitely-scrolling trunk looks like anyway.
  - **The window is one copy tall, so three copies is the minimum.** Two leave
    the top row-slot empty over the last pitch of the pass; the arithmetic is in
    `COPIES`.

  **The period is a consequence, not a preference.** One arrival per
  `STEP_MS` and twenty commits pins the loop at `ROWS x STEP_MS`. The brief
  suggested ~12s, which for twenty commits would be a commit every 600ms —
  legible, but the opposite of calm. 1.8s an arrival is the same tempo as the
  agent marquee next door, and it makes the loop 36s.

  **Motion is CSS keyframes, and gated twice.** `useReducedMotion()` renders a
  single static copy with no animated class on it at all — the still frame, not
  a slower version of the moving one. And because every loop is a keyframe
  animation rather than SMIL, `html[data-page-hidden='true']` in `site.css`
  pauses all of it when the tab is not being looked at, which no CSS selector
  can do to an `<animate>`.
*/

/** The five lane hues, which are the app's own first five graph lanes. */
const LANES = [
  'var(--ws-lane-1)',
  'var(--ws-lane-2)',
  'var(--ws-lane-3)',
  'var(--ws-lane-4)',
  'var(--ws-lane-5)',
] as const;

type Lane = 0 | 1 | 2 | 3 | 4;

/** Row pitch and lane pitch, in the 320x200 user space. */
const PITCH = 9;
const ROW_0_Y = 14;
const LANE_0_X = 22;
const LANE_PITCH = 13;

const rowY = (row: number) => ROW_0_Y + row * PITCH;
const laneX = (lane: Lane) => LANE_0_X + lane * LANE_PITCH;

/** The clip window: the card's inside, less its border. */
const WINDOW = { x: 5, y: 5, width: 310, height: 190 } as const;
/** How deep the top and bottom fades are — one pitch and a little. */
const FADE_PX = 11;

/** How long one commit takes to arrive, and therefore how long a pass takes. */
const STEP_MS = 1800;

type Commit = {
  lane: Lane;
  /** Indices into `COMMITS`. Always larger than the child's — newest first. */
  parents: readonly number[];
  /** The subject bar's width, so the rows do not all measure the same. */
  subject: number;
  /** A ref badge pinned to this commit. */
  badge?: 'head' | 'branch' | 'tag';
};

/**
 * The commits, newest first — a real DAG rather than a pretty pattern.
 *
 * Twenty rows, one commit each, because that is what a commit graph is: a row
 * is a commit and a lane is the branch it was reached on. Drawing two nodes on
 * one row would be a nicer picture of something the app never shows.
 *
 * **A lane is a branch, so a lane's rows form a chain.** Every lane below is a
 * strictly-descending run of indices in which each commit's *first* parent is
 * the next one down; the run's oldest commit forks off another lane, and its
 * newest is either merged by another lane or is a tip. That invariant is what
 * makes the drawing impossible to contradict — the edges are derived from
 * `parents`, so a lane that did not chain would draw as a visibly broken line
 * rather than as a plausible-looking lie.
 *
 * What is in the picture, and where:
 *
 * - **lane 0** — the trunk: 0, 2, 4, 7, 10, 13, 16, 18, 19. Checked out at 0.
 * - **lane 1** — a short feature branch, 3 → 5, forked at 7 and merged at 2.
 * - **lane 2** — the long-running one: 8, 9, 11, 12, 14, forked at 16 and
 *   merged back at 7, so it is open across nine of the twenty rows.
 * - **lane 3** — an open branch, 1 → 6, forked at 10 and never merged.
 * - **lane 4** — another, 15 → 17, forked at 18 and also still open.
 * - **two merges**, at 2 and 7, which are the only nodes with two parents.
 * - **a tag** on 13, and branch badges on the two open tips.
 */
const COMMITS: readonly Commit[] = [
  { lane: 0, parents: [2], subject: 96, badge: 'head' }, //  0 · the checked-out tip
  { lane: 3, parents: [6], subject: 62, badge: 'branch' }, //  1 · an open branch's tip
  { lane: 0, parents: [4, 3], subject: 78 }, //  2 · merge: lane 1 rejoins
  { lane: 1, parents: [5], subject: 88 }, //  3 · lane 1's head
  { lane: 0, parents: [7], subject: 54 }, //  4
  { lane: 1, parents: [7], subject: 92 }, //  5 · lane 1 forks off the trunk
  { lane: 3, parents: [10], subject: 70 }, //  6 · lane 3 forks off the trunk
  { lane: 0, parents: [10, 8], subject: 84 }, //  7 · merge: the long branch rejoins
  { lane: 2, parents: [9], subject: 58 }, //  8 · the long branch's head
  { lane: 2, parents: [11], subject: 104 }, //  9
  { lane: 0, parents: [13], subject: 66 }, // 10
  { lane: 2, parents: [12], subject: 74 }, // 11
  { lane: 2, parents: [14], subject: 48 }, // 12
  { lane: 0, parents: [16], subject: 110, badge: 'tag' }, // 13 · tagged
  { lane: 2, parents: [16], subject: 82 }, // 14 · the long branch forks off
  { lane: 4, parents: [17], subject: 60, badge: 'branch' }, // 15 · the other open tip
  { lane: 0, parents: [18], subject: 90 }, // 16
  { lane: 4, parents: [18], subject: 52 }, // 17 · lane 4 forks off
  { lane: 0, parents: [19], subject: 72 }, // 18
  { lane: 0, parents: [], subject: 100 }, // 19 · the root — see ROOT_STUB
];

/** The commit that is checked out, and the one the branch badge sits on. */
const TIP = 0;
/** The merges — the two nodes with two parents, so the two that are filled. */
const MERGES = COMMITS.reduce<number[]>(
  (found, commit, row) => (commit.parents.length > 1 ? [...found, row] : found),
  [],
);

/**
 * How many times the list is stacked, upwards, in the sliding group.
 *
 * The window is one copy tall (`ROWS x PITCH` = 180 against 190), and the group
 * slides down by one copy over the pass. Copy `c`'s rows sit at
 * `rowY(i) − c x COPY_PX`, so at slide `T` the stack covers
 * `[rowY(0) − (C−1) x COPY_PX + T, rowY(ROWS−1) + T]`. For the window's top
 * edge to stay covered at the very end of the pass (`T → COPY_PX`) that needs
 * `(C − 1) x COPY_PX ≥ rowY(0) − WINDOW.y + COPY_PX`, i.e. `C ≥ 2.05`. Two
 * copies leave the top row-slot empty for the last pitch of every pass; three
 * never do.
 */
const COPIES = 3;
const COPY_PX = COMMITS.length * PITCH;

/**
 * One edge, child down to parent.
 *
 * A same-lane edge is a straight run; a lane change is a cubic whose control
 * points sit on the two verticals, which is how the app draws one — the turn
 * happens inside a row's own box rather than as a long line cutting across
 * several. The edge takes the **child's** lane colour, because that is the
 * branch the edge belongs to.
 */
const Edge = ({ from, to }: { from: number; to: number }) => {
  const child = COMMITS[from];
  const parent = COMMITS[to];
  if (!child || !parent) return null;

  const x1 = laneX(child.lane);
  const y1 = rowY(from);
  const x2 = laneX(parent.lane);
  const y2 = rowY(to);

  const d =
    child.lane === parent.lane
      ? `M${x1} ${y1} V ${y2}`
      : `M${x1} ${y1} C ${x1} ${y1 + 6}, ${x2} ${y2 - 6}, ${x2} ${y2}`;

  return <path d={d} fill="none" stroke={LANES[child.lane]} strokeWidth={1.6} />;
};

/**
 * One pitch of trunk below the root, joining one copy of the list to the next.
 *
 * Not decoration: without it the trunk line breaks at every seam, once per
 * copy, and the break is the one thing in the drawing that would look like a
 * rendering bug rather than like a graph. It is also true — the root of the
 * *visible* window is never the repository's root.
 */
const RootStub = () => (
  <path
    d={`M${laneX(0)} ${rowY(COMMITS.length - 1)} V ${rowY(COMMITS.length)}`}
    fill="none"
    stroke={LANES[0]}
    strokeWidth={1.6}
    data-testid="showcase-root-stub"
  />
);

/**
 * The metadata beside a commit: subject, date, abbreviated SHA.
 *
 * Bars rather than text. A drawing that spells out a fake commit subject
 * invites the reader to read it and then to notice it says nothing; three bars
 * read as "a subject, a date, a SHA" and stop there.
 */
const Meta = ({ row, subject }: { row: number; subject: number }) => {
  const y = rowY(row);
  return (
    <g>
      <rect x={124} y={y - 1.5} width={subject} height={3} rx={1.5} fill="var(--ws-fg-subtle)" />
      <rect x={250} y={y - 1.5} width={26} height={3} rx={1.5} fill="var(--ws-border-strong)" />
      <rect x={282} y={y - 1.5} width={22} height={3} rx={1.5} fill="var(--ws-border-strong)" />
    </g>
  );
};

/**
 * A ref badge pinned to a commit.
 *
 * The checked-out branch is filled in the site's accent; another branch is
 * filled in its own lane's colour, because a badge belongs to the commit it is
 * pinned to and taking the trunk's colour would say the wrong thing; a tag is
 * outlined rather than filled, which is how the app distinguishes the two.
 */
const Badge = ({ row }: { row: number }) => {
  const commit = COMMITS[row];
  if (!commit?.badge) return null;
  const { badge, lane } = commit;
  const y = rowY(row);
  const tint = badge === 'head' ? 'var(--ws-accent)' : LANES[lane];

  return (
    <g data-testid={`showcase-badge-${badge}`}>
      <rect
        x={82}
        y={y - 4}
        width={34}
        height={8}
        rx={3}
        fill={badge === 'tag' ? 'none' : tint}
        stroke={badge === 'tag' ? tint : 'none'}
        strokeWidth={badge === 'tag' ? 1.2 : 0}
      />
      <rect
        x={87}
        y={y - 1}
        width={24}
        height={2}
        rx={1}
        fill={badge === 'head' ? 'var(--ws-accent-fg)' : tint}
        opacity={badge === 'head' ? 1 : badge === 'tag' ? 1 : 0.45}
      />
    </g>
  );
};

/** One whole copy of the list: its edges, its metadata, its badges, its nodes. */
const Copy = ({ copy }: { copy: number }) => (
  <g transform={`translate(0 ${-copy * COPY_PX})`} data-testid="showcase-copy">
    {/* Edges first, so every node sits on top of the lines it joins. */}
    {COMMITS.flatMap((commit, row) =>
      commit.parents.map((parent) => (
        <Edge key={`${row}-${parent}`} from={row} to={parent} />
      )),
    )}
    <RootStub />

    {COMMITS.map(({ subject }, row) => (
      <Meta key={row} row={row} subject={subject} />
    ))}

    {COMMITS.map((_, row) => (
      <Badge key={row} row={row} />
    ))}

    {/*
      The nodes. Hollow on the lane's own colour is the ordinary commit; a merge
      is filled, because it is one of the two with two parents.
    */}
    {COMMITS.map(({ lane }, row) => (
      <circle
        key={row}
        cx={laneX(lane)}
        cy={rowY(row)}
        r={2.8}
        fill={MERGES.includes(row) ? LANES[lane] : 'var(--ws-bg-sunken)'}
        stroke={LANES[lane]}
        strokeWidth={1.6}
      />
    ))}
  </g>
);

export type ShowcaseProps = {
  /**
   * Overrides the media query. Only a test passes it — it is what lets the
   * still frame be asserted without stubbing `matchMedia` for a whole file.
   */
  reduced?: boolean;
};

/**
 * A five-lane commit graph with history arriving at the top of it.
 *
 * Twenty commits: a trunk, a branch that merged, a long-running branch that
 * merged back nine rows later, two that are still open, a tag, and the tip you
 * have checked out. The shape is the smallest picture that carries every claim
 * the Git pillar makes above it and still looks like a repository rather than a
 * diagram of one.
 */
export const Showcase = ({ reduced: reducedProp }: ShowcaseProps = {}) => {
  const detected = useReducedMotion();
  const reduced = reducedProp ?? detected;

  const clipId = 'showcase-window';
  const fadeTopId = 'showcase-fade-top';
  const fadeBottomId = 'showcase-fade-bottom';

  return (
    <figure className="mt-12 sm:mt-16">
      <GlowCard bare glow="lane-1" className="aspect-[3/2] w-full">
        <svg
          viewBox="0 0 320 200"
          className="size-full"
          role="img"
          preserveAspectRatio="xMidYMid meet"
          data-testid="showcase-graph"
          data-animated={!reduced}
          style={
            {
              '--ws-graph-loop': `${COMMITS.length * STEP_MS}ms`,
              '--ws-graph-step': `${STEP_MS}ms`,
              '--ws-graph-shift': `${COPY_PX}px`,
              '--ws-graph-pitch': `${PITCH}px`,
            } as CSSProperties
          }
          aria-label="A commit graph in five coloured lanes, with new commits arriving at the top: a trunk down the left, a short branch that merges back at a filled node, a long-running branch that stays open for nine commits before merging, two more branches still open with their own badges, a tagged release, and the checked-out tip — every commit's subject, date and short SHA beside it."
        >
          <defs>
            <clipPath id={clipId}>
              <rect {...WINDOW} rx={9} />
            </clipPath>
            {/*
              The edges of the window, faded rather than cut. A row that pops
              into existence on a hard line reads as a rendering artefact; a row
              that materialises reads as one arriving. Both gradients are the
              card's own background, so they work in either theme with nothing
              theme-aware in the JS.
            */}
            <linearGradient id={fadeTopId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ws-bg-sunken)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--ws-bg-sunken)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={fadeBottomId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ws-bg-sunken)" stopOpacity={0} />
              <stop offset="100%" stopColor="var(--ws-bg-sunken)" stopOpacity={1} />
            </linearGradient>
          </defs>

          <rect
            x={0.5}
            y={0.5}
            width={319}
            height={199}
            rx={12}
            fill="var(--ws-bg-sunken)"
            stroke="var(--ws-border)"
          />

          <g clipPath={`url(#${clipId})`}>
            {reduced ? (
              <>
                {/* The still frame: one copy, and the highlight on its tip. */}
                <rect
                  x={10}
                  y={rowY(TIP) - 4}
                  width={300}
                  height={8}
                  rx={3}
                  fill="var(--ws-accent-soft)"
                  data-testid="showcase-head"
                />
                <Copy copy={0} />
              </>
            ) : (
              <g className="ws-graph-scroll" data-testid="showcase-scroll">
                {Array.from({ length: COPIES }, (_, copy) => (
                  <Copy key={copy} copy={copy} />
                ))}
              </g>
            )}

            {reduced ? null : (
              <>
                <rect
                  x={WINDOW.x}
                  y={WINDOW.y}
                  width={WINDOW.width}
                  height={FADE_PX}
                  fill={`url(#${fadeTopId})`}
                />
                <rect
                  x={WINDOW.x}
                  y={WINDOW.y + WINDOW.height - FADE_PX}
                  width={WINDOW.width}
                  height={FADE_PX}
                  fill={`url(#${fadeBottomId})`}
                />

                {/*
                  ── The three things that move, above the fades ──────────────

                  All three live in *screen* space rather than inside the
                  sliding group, and each one is placed where it is true for
                  every frame rather than for one commit:

                  - the **write head** is on the trunk, at the top of the
                    window, because the trunk lane is occupied in every frame
                    (the root stub joins it across the seam). Its stroke draws
                    itself once per arrival with `stroke-dashoffset`;
                  - the **pulse** breathes out of the same point — the existing
                    gentle one, kept, and the only SMIL left in this file;
                  - the **row highlight** starts on the row that has just
                    arrived, drifts down one pitch with it as the graph slides,
                    then fades out and picks up the next. That is the
                    checked-out row travelling with its commit, which is what a
                    commit does to HEAD.
                */}
                <path
                  className="ws-graph-write"
                  d={`M${laneX(0)} ${WINDOW.y} V ${rowY(0)}`}
                  pathLength={1}
                  fill="none"
                  stroke={LANES[0]}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  data-testid="showcase-write"
                />
                <circle
                  cx={laneX(0)}
                  cy={rowY(0)}
                  r={3}
                  fill="none"
                  stroke={LANES[0]}
                  strokeWidth={1.2}
                  data-testid="showcase-pulse"
                >
                  <animate attributeName="r" values="3;8;3" dur="2.6s" repeatCount="indefinite" />
                  <animate
                    attributeName="opacity"
                    values="0.6;0;0.6"
                    dur="2.6s"
                    repeatCount="indefinite"
                  />
                </circle>
                <rect
                  className="ws-graph-head"
                  x={10}
                  y={rowY(TIP) - 4}
                  width={300}
                  height={8}
                  rx={3}
                  fill="var(--ws-accent-soft)"
                  data-testid="showcase-head"
                />
              </>
            )}
          </g>
        </svg>
      </GlowCard>
      <figcaption className="mt-3 text-sm text-fg-subtle">
        The commit graph as the app lays it out: one lane per branch, a filled node where two
        parents meet, a badge on the ref you have checked out — and the newest commits
        arriving at the top as the history below them scrolls away.
      </figcaption>
    </figure>
  );
};
