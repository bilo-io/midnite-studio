/**
 * The graph styles, as data.
 *
 * Nothing in `git-engine` knows these exist: lane assignment is already a pure
 * function of history, so a style only decides how the lanes it produced are
 * *drawn*. That split is what lets a style be a settings toggle rather than a
 * re-stream.
 *
 * The four avatar styles carry a face in every node, which sets a floor on node
 * size — none of them can use a 4px dot. So they differentiate on edge routing,
 * stroke weight, palette and row height, and only secondarily on node size.
 * `classic` opts out of the avatar entirely and gets that floor back, which is
 * the whole point of it: it is the graph as it was drawn before Phase 14, dots
 * and all, with the Author column the avatar had replaced.
 */
export type GraphThemeId =
  | 'classic'
  | 'git-graph'
  | 'git-extensions'
  | 'sourcetree'
  | 'gitkraken';

/** How a lane change is drawn between one row and the next. */
export type EdgeStyle = 'orthogonal' | 'bezier' | 'straight';

/** Lane colours at full strength, or desaturated. */
export type PaletteStyle = 'vivid' | 'muted';

/**
 * What the commit node IS.
 *
 * `avatar` — the author's face, ringed in the lane colour.
 * `dot` — a small filled circle, hollow when the commit is a merge.
 *
 * This is the one field that changes the table's column set rather than just
 * its drawing: a face names its author, a dot does not, so a `dot` style brings
 * the Author column back (see `showsAuthorColumn`).
 */
export type NodeStyle = 'avatar' | 'dot';

export type GraphTheme = {
  id: GraphThemeId;
  label: string;
  /** One line, shown under the preview in Settings. */
  blurb: string;
  rowHeight: number;
  laneWidth: number;
  /** Radius of the commit node. */
  nodeRadius: number;
  /**
   * Diameter of the avatar clipped inside the node.
   *
   * Meaningless — and set to 0 — when `node` is `dot`: there is no face to size.
   */
  avatarSize: number;
  strokeWidth: number;
  edge: EdgeStyle;
  /** Corner radius for `orthogonal` edges; ignored otherwise. */
  cornerRadius: number;
  /** Arrowheads pointing into the node, as git-graph draws them. */
  arrowheads: boolean;
  /** Ring drawn around the avatar in the lane's colour. Unused by `dot` nodes. */
  ringWidth: number;
  palette: PaletteStyle;
  node: NodeStyle;
};

export const GRAPH_THEMES: Record<GraphThemeId, GraphTheme> = {
  /**
   * The graph exactly as it shipped from Phase 5 to Phase 14.
   *
   * Reinstated as a style rather than as the default: the numbers here are the
   * old module constants verbatim (26px rows, 14px lanes, a 3.5px dot, a 1.75px
   * bezier), so anyone who preferred the dense pre-avatar table gets that table
   * back rather than an approximation of it.
   */
  classic: {
    id: 'classic',
    label: 'Classic',
    blurb: 'Small dots, hollow merges, a named Author column. The pre-avatar graph.',
    rowHeight: 26,
    laneWidth: 14,
    nodeRadius: 3.5,
    avatarSize: 0,
    strokeWidth: 1.75,
    edge: 'bezier',
    cornerRadius: 0,
    arrowheads: false,
    ringWidth: 0,
    palette: 'vivid',
    node: 'dot',
  },
  'git-graph': {
    id: 'git-graph',
    label: 'Git Graph',
    blurb: 'Right-angle lanes with arrowheads. Solid nodes, crisp corners.',
    rowHeight: 34,
    laneWidth: 24,
    nodeRadius: 9,
    avatarSize: 16,
    strokeWidth: 2,
    edge: 'orthogonal',
    cornerRadius: 3,
    arrowheads: true,
    ringWidth: 2,
    palette: 'vivid',
    node: 'avatar',
  },
  'git-extensions': {
    id: 'git-extensions',
    label: 'Git Extensions',
    blurb: 'Thin, straight lanes in a muted palette. The quietest of the five.',
    rowHeight: 28,
    laneWidth: 20,
    nodeRadius: 9,
    avatarSize: 16,
    strokeWidth: 1.5,
    edge: 'straight',
    cornerRadius: 0,
    arrowheads: false,
    ringWidth: 1.5,
    palette: 'muted',
    node: 'avatar',
  },
  sourcetree: {
    id: 'sourcetree',
    label: 'Sourcetree',
    blurb: 'Flowing curves in full colour. The most organic reading of history.',
    rowHeight: 32,
    laneWidth: 24,
    nodeRadius: 10,
    avatarSize: 18,
    strokeWidth: 2.5,
    edge: 'bezier',
    cornerRadius: 0,
    arrowheads: false,
    ringWidth: 2,
    palette: 'vivid',
    node: 'avatar',
  },
  gitkraken: {
    id: 'gitkraken',
    label: 'GitKraken',
    blurb: 'Thick lanes and large avatars. Built to be read across the room.',
    rowHeight: 38,
    laneWidth: 30,
    nodeRadius: 13,
    avatarSize: 24,
    strokeWidth: 3,
    edge: 'orthogonal',
    cornerRadius: 8,
    arrowheads: false,
    ringWidth: 2.5,
    palette: 'vivid',
    node: 'avatar',
  },
};

/** Render order — also the order of the cards in Settings. */
export const GRAPH_THEME_IDS: readonly GraphThemeId[] = [
  'classic',
  'git-graph',
  'git-extensions',
  'sourcetree',
  'gitkraken',
];

export const DEFAULT_GRAPH_THEME: GraphThemeId = 'git-graph';

/** Falls back rather than throwing: a stored id from a future build must not break boot. */
export const graphTheme = (id: string | null | undefined): GraphTheme =>
  GRAPH_THEMES[(id ?? '') as GraphThemeId] ?? GRAPH_THEMES[DEFAULT_GRAPH_THEME];

/**
 * Vertical padding between the avatar and the row edge.
 *
 * Asserted in the tests: a style whose `rowHeight` does not clear its
 * `avatarSize` plus this on both sides crops the face against the neighbouring
 * row, which reads as a rendering bug rather than a style.
 */
export const ROW_PADDING = 3;

/**
 * Half the node's painted width — the avatar plus its ring, or the dot plus
 * half its stroke (a stroke straddles the circle it outlines).
 *
 * The unit the whole gutter is measured in: `laneOffset` keeps the outermost
 * nodes this far from the gutter's edges, and `MIN_LANE_WIDTH_RATIO` sets how
 * far lanes may close in terms of it.
 */
export const nodeExtent = (theme: GraphTheme): number =>
  theme.node === 'avatar'
    ? theme.avatarSize / 2 + theme.ringWidth
    : theme.nodeRadius + theme.strokeWidth / 2;

/**
 * How far lane 0's centre sits from the gutter's left edge — and, mirrored,
 * the last lane's from its right.
 *
 * At the style's own `laneWidth` this is exactly half a lane, which is where
 * the nodes have always been drawn; the `max` only bites once the gutter has
 * been dragged narrower than the lanes want. Without it, compressed lanes put
 * lane 0's centre less than a node-radius from x=0 and the face bleeds out of
 * the gutter — `overflow-visible` on the row SVG means it paints over the
 * BRANCH / TAG column rather than being clipped.
 *
 * This is what makes "lane 0 stays inside the gutter" structural instead of an
 * invariant every new style has to be checked against.
 */
export const laneOffset = (theme: GraphTheme, laneWidth: number): number =>
  Math.max(nodeExtent(theme), laneWidth / 2);

/** Horizontal centre of a lane, at a given spacing. */
export const laneCentre = (theme: GraphTheme, laneWidth: number, lane: number): number =>
  laneOffset(theme, laneWidth) + lane * laneWidth;

/**
 * Width the gutter needs to hold `lanes` lanes at `laneWidth` spacing.
 *
 * An offset at each end plus the runs between the lanes — which, at the style's
 * own `laneWidth`, comes to exactly `lanes * laneWidth`, the value the gutter
 * has always been. The general form only differs once lanes are compressed.
 */
export const gutterWidth = (theme: GraphTheme, laneWidth: number, lanes: number): number =>
  laneOffset(theme, laneWidth) * 2 + Math.max(0, lanes - 1) * laneWidth;

/**
 * Tightest lane spacing the gutter may be dragged to, as a fraction of a node's
 * painted width.
 *
 * Half, so nodes overlap the way a stacked avatar list does: each keeps a
 * visible crescent and the frontmost is whole. Nodes that merely TOUCH would
 * cap compression at a few percent for the avatar styles — GitKraken's 30px
 * lane already holds a 29px node — which is no compression at all, and the
 * point of a resizable gutter is to get a wide history out of the way.
 */
export const MIN_LANE_WIDTH_RATIO = 0.5;

export const minLaneWidth = (theme: GraphTheme): number =>
  nodeExtent(theme) * 2 * MIN_LANE_WIDTH_RATIO;

/**
 * The lane spacing that renders a gutter exactly `width` wide.
 *
 * The inverse of `gutterWidth`, which has two regimes because `laneOffset`
 * does: while the lanes are wider than a node the offset is half a lane and the
 * width is simply `lanes * laneWidth`; once they are narrower the offset pins
 * to a node radius and only the runs between lanes give. Solving the right one
 * is what keeps the drag handle and the gutter's painted edge on the same
 * pixel — deriving the spacing approximately and re-deriving the width from it
 * makes the graph lag the pointer by a pixel or two, which reads as a stutter.
 */
export const laneWidthForGutter = (theme: GraphTheme, lanes: number, width: number): number => {
  const node = nodeExtent(theme) * 2;
  const clamp = (value: number): number =>
    Math.min(theme.laneWidth, Math.max(minLaneWidth(theme), value));

  // A single lane has no runs between lanes, so the whole gutter IS the two
  // offsets: the spacing and the width are the same number until the offset
  // pins, below which the gutter simply stops narrowing.
  if (lanes <= 1) return clamp(width);

  /*
    Which regime a requested width lands in is decided by the width alone, and
    the two are exhaustive: at `laneWidth >= node` the width is exactly
    `lanes * laneWidth`, so an even share of it is >= a node; below it the width
    is under `lanes * node`, so the even share is under a node. No third case,
    and no need to guess and check.
  */
  const even = width / lanes;
  return clamp(even >= node ? even : (width - node) / (lanes - 1));
};

/**
 * Whether the table carries an Author column in this style.
 *
 * Derived from the node rather than declared separately, because the two are
 * the same decision seen twice: the avatar retired the column by naming the
 * author itself, so a style whose node is a dot has nothing naming the author
 * and has to say it in words. Making it a second flag would allow the two
 * incoherent combinations — a face beside a redundant Author column, and a dot
 * graph with no author anywhere.
 */
export const showsAuthorColumn = (theme: GraphTheme): boolean => theme.node === 'dot';

/**
 * Where an arrowhead's tip should land: the node's edge, not its centre.
 *
 * A marker at the path's natural endpoint sits at `(nodeX, mid)` — dead centre
 * of an 18px avatar that is drawn afterwards and paints straight over it. The
 * arrow has to stop short of the face for there to be an arrow at all.
 */
export const ARROW_GAP = 2;

/**
 * Shortest arriving segment an arrowhead can sit on and still read as one.
 *
 * The arrow occupies the lane BETWEEN the top of the row and the top of the
 * node, and the avatar eats most of the upper half — an 18px face in a 30px row
 * leaves four pixels, which renders as a marker overhanging the row edge above a
 * line too short to see. Asserted per arrowhead theme in the tests.
 */
export const MIN_ARROW_RUN = 4;

/** Length of the arriving segment: top of the row down to the node's edge. */
export const arrivalRun = (theme: GraphTheme): number =>
  theme.rowHeight / 2 - nodeExtent(theme) - ARROW_GAP;

/**
 * The shortest row this style's own geometry permits.
 *
 * Two independent floors, and a style has to clear both:
 *
 * - the node plus `ROW_PADDING` at the top and bottom, or the face crops
 *   against the neighbouring row;
 * - for an arrowhead style, enough room above the node for the marker to sit on
 *   a segment long enough to read as a line — see `MIN_ARROW_RUN`.
 *
 * Written down as a function because the density setting needs to know where to
 * stop compressing, and "stop where the drawing breaks" is the only answer that
 * does not have to be re-derived by hand for every style added later.
 */
export const minRowHeight = (theme: GraphTheme): number => {
  const clearsNode = nodeExtent(theme) * 2 + ROW_PADDING * 2;
  const clearsArrow = theme.arrowheads
    ? (nodeExtent(theme) + ARROW_GAP + MIN_ARROW_RUN) * 2
    : 0;
  return Math.max(clearsNode, clearsArrow, theme.avatarSize + ROW_PADDING * 2);
};

/**
 * Row density.
 *
 * A separate axis from the style, because "which graph do I like" and "how much
 * history do I want on screen" are different questions — and the answer to the
 * second changes with the laptop, not with taste.
 */
export type GraphDensity = 'comfortable' | 'compact';

export const GRAPH_DENSITIES: readonly GraphDensity[] = ['comfortable', 'compact'];

export const DEFAULT_GRAPH_DENSITY: GraphDensity = 'comfortable';

/** How far `compact` pulls the row height and the node in. */
const COMPACT_ROW = 0.82;
const COMPACT_NODE = 0.86;

/**
 * The style as it will actually be drawn, at a given density.
 *
 * Compact shrinks the node a little and the row a lot — density is about rows
 * per screen, and the node only comes down far enough to let the row follow.
 * Then `minRowHeight` puts a floor under it, so compression stops where the
 * geometry would break rather than at a hand-picked number per style. That is
 * what keeps `graph-themes.test.ts`'s invariants true of the compact styles
 * without a second set of assertions tuned to them: they are the same
 * invariants, enforced structurally.
 *
 * Every returned style is a `GraphTheme`, so nothing downstream — the
 * virtualizer, `nodeExtent`, `laneOffset`, the SVG — needs to know density
 * exists.
 *
 * **Takes a BASE style.** Scaling compounds, so the caller must derive from
 * `GRAPH_THEMES` each render rather than hold a scaled theme and re-scale it.
 * `graphThemeFor` is the entry point that guarantees it.
 */
export const scaleTheme = (theme: GraphTheme, density: GraphDensity): GraphTheme => {
  if (density === 'comfortable') return theme;

  const scaled: GraphTheme = {
    ...theme,
    avatarSize: Math.round(theme.avatarSize * COMPACT_NODE),
    // Half-pixel steps: a dot's radius is a coordinate, not a box, and rounding
    // `classic`'s 3.5 to 3 costs a fifth of its area.
    nodeRadius: Math.round(theme.nodeRadius * COMPACT_NODE * 2) / 2,
    laneWidth: Math.round(theme.laneWidth * COMPACT_NODE),
    // Stroke and ring stay put. They are 1.5–3px already; scaling them lands on
    // fractions that anti-alias into a blur rather than reading as a thinner
    // line, and a hairline lane is harder to follow, not denser.
    rowHeight: theme.rowHeight,
  };

  return {
    ...scaled,
    rowHeight: Math.max(Math.round(theme.rowHeight * COMPACT_ROW), minRowHeight(scaled)),
  };
};

/**
 * The gap between the BRANCH / TAG column and the lane gutter, in px.
 *
 * The row lays its cells out with Tailwind's `gap-2`, and the ref connector —
 * the leader line running from a branch chip to the commit it names — has to
 * cross that gap. The chip's half is an HTML rule that stretches to the column's
 * edge; the gutter's half is an SVG line that starts this far to the LEFT of the
 * SVG's own origin (`overflow-visible` lets it paint there). Written down once
 * so the two halves cannot meet at a seam if the row's spacing ever changes.
 */
export const ROW_GAP = 8;

/**
 * Width of the lane rail — the bar standing between the gutter and the commit
 * message, in the colour of the branch the commit landed on.
 *
 * GitKraken's, and drawn only by the styles whose node is an avatar. A face
 * says who, not where, so the rail is what carries the branch across to the
 * subject line; `classic` has the whole lane drawn in that colour a few pixels
 * away and does not need saying twice.
 */
export const RAIL_WIDTH = 3;

/**
 * Opacity of that leader line, against the lane's own colour.
 *
 * Below the lanes deliberately: the connector is an annotation joining a label
 * to a node, and at full strength it reads as a branch of its own — a horizontal
 * one, which is a shape the graph never otherwise draws.
 */
export const CONNECTOR_OPACITY = 0.45;

/**
 * The style to draw with, from the two persisted settings.
 *
 * The single entry point the renderer should use: it resolves the id from the
 * store (falling back for an unknown one) and applies density to the BASE
 * style, which is what keeps `scaleTheme`'s compounding precondition from being
 * something every call site has to remember.
 */
export const graphThemeFor = (
  id: string | null | undefined,
  density: GraphDensity,
): GraphTheme => scaleTheme(graphTheme(id), density);
