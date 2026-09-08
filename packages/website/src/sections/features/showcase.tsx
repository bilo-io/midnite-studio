import { GlowCard, useReducedMotion } from '../../components';

/*
  The commit graph, drawn.

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

  **Every colour is a token.** `--ws-lane-1..4` for the lanes, their edges and
  their nodes; `--ws-bg-*` / `--ws-border*` / `--ws-fg-*` for the frame and the
  commit rows. No hex, no `dark:` prefix — both themes come from the tokens the
  nav's theme switcher flips (`data-theme` / `.ws-auto-light`, see `theme.ts`),
  as they do for the rest of the page. That is a second reason the screenshot
  had to go: an `<img>` needs the resolved theme *in JS* to pick a file, which
  is a subscription the drawing simply does not have.

  **Motion is SMIL, and gated on `useReducedMotion()`.** One thing moves: a ring
  breathing out of the checked-out tip. SMIL is the half of the motion policy CSS
  cannot reach — zeroing a duration token does nothing to an `<animate>` — so the
  element is simply not rendered when the preference is set.
*/

/** The four lane hues, which are the app's own first four graph lanes. */
const LANES = [
  'var(--ws-lane-1)',
  'var(--ws-lane-2)',
  'var(--ws-lane-3)',
  'var(--ws-lane-4)',
] as const;

type Lane = 0 | 1 | 2 | 3;

/** Row `r`'s centre line and lane `l`'s centre, in the 320x200 user space. */
const rowY = (row: number) => 24 + row * 19;
const laneX = (lane: Lane) => 30 + lane * 18;

/**
 * The commits, newest first — a real little DAG rather than a pretty pattern.
 *
 * Nine rows, one commit each, because that is what a commit graph is: a row is
 * a commit and a lane is the branch it was reached on. Drawing two nodes on one
 * row would be a nicer picture of something the app never shows.
 *
 * `parents` are indices into this same array, and every one of them is *below*
 * its child — the newest-at-top order the app uses. The commit with two parents
 * is the merge, and it is the only interesting node in the picture.
 */
const COMMITS: readonly { lane: Lane; parents: readonly number[]; subject: number }[] = [
  { lane: 0, parents: [1], subject: 88 }, //  0 · the checked-out tip
  { lane: 0, parents: [3, 2], subject: 74 }, //  1 · the merge
  { lane: 1, parents: [4], subject: 96 }, //  2 · on the branch that merged
  { lane: 0, parents: [5], subject: 62 }, //  3
  { lane: 1, parents: [5], subject: 84 }, //  4 · where that branch forked
  { lane: 0, parents: [8], subject: 70 }, //  5
  { lane: 2, parents: [8], subject: 92 }, //  6 · an open branch, one commit
  { lane: 3, parents: [8], subject: 58 }, //  7 · another, still open
  { lane: 0, parents: [], subject: 78 }, //  8
];

/** The commit that is checked out, and the one the branch badge sits on. */
const TIP = 0;
/** The merge commit — the one node with two parents, so the one that is filled. */
const MERGE = 1;

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
      : `M${x1} ${y1} C ${x1} ${y1 + 12}, ${x2} ${y2 - 12}, ${x2} ${y2}`;

  return <path d={d} fill="none" stroke={LANES[child.lane]} strokeWidth={2} />;
};

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
      <rect x={142} y={y - 2.5} width={subject} height={5} rx={2.5} fill="var(--ws-fg-subtle)" />
      <rect x={250} y={y - 2} width={28} height={4} rx={2} fill="var(--ws-border-strong)" />
      <rect x={286} y={y - 2} width={20} height={4} rx={2} fill="var(--ws-border-strong)" />
    </g>
  );
};

export type ShowcaseProps = {
  /**
   * Overrides the media query. Only a test passes it — it is what lets the
   * still frame be asserted without stubbing `matchMedia` for a whole file.
   */
  reduced?: boolean;
};

/**
 * A four-lane commit graph: a branch that merged, two that are still open, and
 * the tip you have checked out.
 *
 * The shape is the smallest picture that carries every claim the Git pillar
 * makes above it. Fewer lanes would drop the merge, and the merge is the one
 * thing a straight list of commits cannot show.
 */
export const Showcase = ({ reduced: reducedProp }: ShowcaseProps = {}) => {
  const detected = useReducedMotion();
  const reduced = reducedProp ?? detected;

  return (
    <figure className="mt-12 sm:mt-16">
      <GlowCard bare glow="lane-1" className="aspect-[3/2] w-full">
        <svg
          viewBox="0 0 320 200"
          className="size-full"
          role="img"
          preserveAspectRatio="xMidYMid meet"
          data-testid="showcase-graph"
          aria-label="A commit graph in four coloured lanes: a trunk down the left, a branch that forks off it and merges back in at a filled node, two more branches still open, and the checked-out tip carrying a branch badge — with every commit's subject, date and short SHA beside it."
        >
          <rect
            x={0.5}
            y={0.5}
            width={319}
            height={199}
            rx={12}
            fill="var(--ws-bg-sunken)"
            stroke="var(--ws-border)"
          />

          {/* The selected row, drawn the way the app highlights one. */}
          <rect
            x={12}
            y={rowY(TIP) - 9}
            width={296}
            height={18}
            rx={5}
            fill="var(--ws-accent-soft)"
          />

          {/* Edges first, so every node sits on top of the lines it joins. */}
          {COMMITS.flatMap((commit, row) =>
            commit.parents.map((parent) => (
              <Edge key={`${row}-${parent}`} from={row} to={parent} />
            )),
          )}

          {COMMITS.map(({ subject }, row) => (
            <Meta key={row} row={row} subject={subject} />
          ))}

          {/*
            The nodes. Hollow on the lane's own colour is the ordinary commit;
            the merge is filled, because it is the one with two parents; the tip
            is filled and ringed in the card's background, which is how a
            checked-out ref reads without a second colour.
          */}
          {COMMITS.map(({ lane }, row) =>
            row === TIP ? null : (
              <circle
                key={row}
                cx={laneX(lane)}
                cy={rowY(row)}
                r={4}
                fill={row === MERGE ? LANES[lane] : 'var(--ws-bg-sunken)'}
                stroke={LANES[lane]}
                strokeWidth={2}
              />
            ),
          )}

          {reduced ? null : (
            <circle
              cx={laneX(0)}
              cy={rowY(TIP)}
              r={5}
              fill="none"
              stroke={LANES[0]}
              strokeWidth={1.5}
              data-testid="showcase-pulse"
            >
              <animate attributeName="r" values="5;11;5" dur="2.6s" repeatCount="indefinite" />
              <animate
                attributeName="opacity"
                values="0.6;0;0.6"
                dur="2.6s"
                repeatCount="indefinite"
              />
            </circle>
          )}
          <circle
            cx={laneX(0)}
            cy={rowY(TIP)}
            r={5}
            fill={LANES[0]}
            stroke="var(--ws-bg-sunken)"
            strokeWidth={1.5}
          />

          {/* The branch badge pinned to the tip, in the site's accent. */}
          <g data-testid="showcase-tip-badge">
            <rect x={98} y={rowY(TIP) - 7} width={34} height={14} rx={4} fill="var(--ws-accent)" />
            <rect
              x={103}
              y={rowY(TIP) - 2}
              width={24}
              height={4}
              rx={2}
              fill="var(--ws-accent-fg)"
            />
          </g>

          {/* A tag badge on the merge, outlined in the branch's own hue. */}
          <g>
            <rect
              x={98}
              y={rowY(MERGE) - 6}
              width={28}
              height={12}
              rx={3}
              fill="none"
              stroke={LANES[1]}
              strokeWidth={1.5}
            />
            <rect x={103} y={rowY(MERGE) - 2} width={18} height={4} rx={2} fill={LANES[1]} />
          </g>
        </svg>
      </GlowCard>
      <figcaption className="mt-3 text-sm text-fg-subtle">
        The commit graph as the app lays it out: one lane per branch, a filled node where two
        parents meet, and a badge on the ref you have checked out.
      </figcaption>
    </figure>
  );
};
