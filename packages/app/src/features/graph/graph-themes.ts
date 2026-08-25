/**
 * The four graph styles, as data.
 *
 * Nothing in `git-engine` knows these exist: lane assignment is already a pure
 * function of history, so a style only decides how the lanes it produced are
 * *drawn*. That split is what lets a style be a settings toggle rather than a
 * re-stream.
 *
 * Every style carries an avatar, which sets a floor on node size — no style can
 * use a 4px dot, because the node has to hold a face. So the four differentiate
 * on edge routing, stroke weight, palette and row height, and only secondarily
 * on node size.
 */
export type GraphThemeId = 'git-graph' | 'git-extensions' | 'sourcetree' | 'gitkraken';

/** How a lane change is drawn between one row and the next. */
export type EdgeStyle = 'orthogonal' | 'bezier' | 'straight';

/** Lane colours at full strength, or desaturated. */
export type PaletteStyle = 'vivid' | 'muted';

export type GraphTheme = {
  id: GraphThemeId;
  label: string;
  /** One line, shown under the preview in Settings. */
  blurb: string;
  rowHeight: number;
  laneWidth: number;
  /** Radius of the commit node. */
  nodeRadius: number;
  /** Diameter of the avatar clipped inside the node. */
  avatarSize: number;
  strokeWidth: number;
  edge: EdgeStyle;
  /** Corner radius for `orthogonal` edges; ignored otherwise. */
  cornerRadius: number;
  /** Arrowheads pointing into the node, as git-graph draws them. */
  arrowheads: boolean;
  /** Ring drawn around the avatar in the lane's colour. */
  ringWidth: number;
  palette: PaletteStyle;
};

export const GRAPH_THEMES: Record<GraphThemeId, GraphTheme> = {
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
  },
  'git-extensions': {
    id: 'git-extensions',
    label: 'Git Extensions',
    blurb: 'Thin, straight lanes in a muted palette. The quietest of the four.',
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
  },
};

/** Render order — also the order of the cards in Settings. */
export const GRAPH_THEME_IDS: readonly GraphThemeId[] = [
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
 * Half the node's painted width — the avatar plus its ring.
 *
 * `laneWidth` is centre-to-centre, so a lane narrower than twice this puts two
 * adjacent faces on top of each other, and lane 0's node bleeds out of the
 * gutter entirely (`overflow-visible` on the row SVG lets it paint over the
 * BRANCH / TAG column). Asserted per theme in the tests.
 */
export const nodeExtent = (theme: GraphTheme): number => theme.avatarSize / 2 + theme.ringWidth;

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
