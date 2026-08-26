import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRAPH_THEME,
  GRAPH_THEMES,
  GRAPH_THEME_IDS,
  ROW_PADDING,
  MIN_ARROW_RUN,
  arrivalRun,
  graphTheme,
  gutterWidth,
  laneCentre,
  laneWidthForGutter,
  minLaneWidth,
  nodeExtent,
  minRowHeight,
  scaleTheme,
  showsAuthorColumn,
} from './graph-themes';

/** The styles whose node is a face — the ones the avatar invariants apply to. */
const AVATAR_IDS = GRAPH_THEME_IDS.filter((id) => GRAPH_THEMES[id].node === 'avatar');
const DOT_IDS = GRAPH_THEME_IDS.filter((id) => GRAPH_THEMES[id].node === 'dot');

describe('graph themes', () => {
  it('lists every declared theme exactly once', () => {
    expect([...GRAPH_THEME_IDS].sort()).toEqual(Object.keys(GRAPH_THEMES).sort());
    expect(new Set(GRAPH_THEME_IDS).size).toBe(GRAPH_THEME_IDS.length);
  });

  /**
   * The invariants the avatar imposes — on the styles that HAVE one. A dot
   * style is exempt by construction (its `avatarSize` is 0), which is the whole
   * reason it can be 26px tall with a 3.5px node.
   */
  it.each(AVATAR_IDS)('%s has a row tall enough for its avatar', (id) => {
    const theme = GRAPH_THEMES[id];
    expect(theme.rowHeight).toBeGreaterThanOrEqual(theme.avatarSize + ROW_PADDING * 2);
  });

  it.each(AVATAR_IDS)('%s has a node big enough to hold its avatar', (id) => {
    const theme = GRAPH_THEMES[id];
    expect(theme.nodeRadius * 2).toBeGreaterThanOrEqual(theme.avatarSize);
  });

  /**
   * The mirror of the above: a dot style must NOT be carrying avatar geometry.
   * A non-zero `avatarSize` on a style that draws a circle is a field that
   * silently means nothing, and the next person to read it will size something
   * from it.
   */
  it.each(DOT_IDS)('%s declares no avatar geometry it does not use', (id) => {
    const theme = GRAPH_THEMES[id];
    expect(theme.avatarSize).toBe(0);
    expect(theme.ringWidth).toBe(0);
  });

  it.each(GRAPH_THEME_IDS)('%s clears its own row vertically', (id) => {
    const theme = GRAPH_THEMES[id];
    // Whatever the node is, it has to fit between the rows above and below —
    // the avatar assertion above says it for faces, this says it for both.
    expect(theme.rowHeight / 2).toBeGreaterThanOrEqual(nodeExtent(theme));
  });

  it.each(GRAPH_THEME_IDS)('%s keeps adjacent nodes apart at its own spacing', (id) => {
    const theme = GRAPH_THEMES[id];
    // `laneWidth` is centre-to-centre and `nodeExtent` is the painted radius
    // including the ring, so anything narrower than twice it puts two faces on
    // top of each other. The first version of this asserted 0.75x the avatar
    // — which every theme passed while every theme overlapped.
    expect(theme.laneWidth).toBeGreaterThanOrEqual(nodeExtent(theme) * 2);
  });

  it.each(GRAPH_THEME_IDS)('%s keeps lane 0 inside the gutter at any spacing', (id) => {
    const theme = GRAPH_THEMES[id];
    // The row SVG is `overflow-visible`, so a node whose centre is less than
    // its own radius from x=0 does not clip — it paints over the BRANCH / TAG
    // column. `laneOffset` is what stops that, and it has to hold all the way
    // down to the tightest spacing the gutter can be dragged to, not just at
    // the style's own `laneWidth`.
    for (const spacing of [minLaneWidth(theme), theme.laneWidth, theme.laneWidth * 2]) {
      expect(laneCentre(theme, spacing, 0)).toBeGreaterThanOrEqual(nodeExtent(theme));
    }
  });

  it.each(GRAPH_THEME_IDS.filter((id) => GRAPH_THEMES[id].arrowheads))(
    '%s leaves a visible run for its arrowhead',
    (id) => {
      // The avatar eats the upper half of the row, which is exactly where an
      // arriving edge lives. Declaring `arrowheads: true` without the headroom
      // to draw one renders a marker overhanging the row above a 2px line.
      expect(arrivalRun(GRAPH_THEMES[id])).toBeGreaterThanOrEqual(MIN_ARROW_RUN);
    },
  );

  it('only gives arrowheads to the style that asked for them', () => {
    const withArrows = GRAPH_THEME_IDS.filter((id) => GRAPH_THEMES[id].arrowheads);
    expect(withArrows).toEqual(['git-graph']);
  });

  it('falls back rather than throwing on an unknown id', () => {
    // A stored id from a newer build must not take the app down at boot.
    expect(graphTheme('from-the-future').id).toBe(DEFAULT_GRAPH_THEME);
    expect(graphTheme(null).id).toBe(DEFAULT_GRAPH_THEME);
    expect(graphTheme(undefined).id).toBe(DEFAULT_GRAPH_THEME);
  });

  it('round-trips a known id', () => {
    expect(graphTheme('gitkraken').label).toBe('GitKraken');
  });

  /**
   * The Author column and the avatar are the same decision seen twice: the face
   * names the author, so a style that has one must not also spend a column
   * saying it, and a style that has none must.
   */
  it.each(GRAPH_THEME_IDS)('%s pairs its Author column with its node style', (id) => {
    const theme = GRAPH_THEMES[id];
    expect(showsAuthorColumn(theme)).toBe(theme.node === 'dot');
  });

  /**
   * The gutter is a resizable column, so its geometry has to survive being
   * asked for widths nobody designed it around.
   */
  describe('gutter geometry', () => {
    const LANE_COUNTS = [1, 2, 5, 12];

    it.each(GRAPH_THEME_IDS)('%s draws its natural gutter exactly as before', (id) => {
      const theme = GRAPH_THEMES[id];
      // The general form has to reduce to `lanes * laneWidth` at the style's
      // own spacing, or reinstating a resizable gutter silently re-lays-out
      // every graph that was never dragged.
      for (const lanes of LANE_COUNTS) {
        expect(gutterWidth(theme, theme.laneWidth, lanes)).toBe(lanes * theme.laneWidth);
        expect(laneCentre(theme, theme.laneWidth, 0)).toBe(theme.laneWidth / 2);
      }
    });

    it.each(GRAPH_THEME_IDS)('%s bottoms out at one node for a single lane', (id) => {
      const theme = GRAPH_THEMES[id];
      // The floor the whole feature is described by: a history with one lane
      // squeezes down to exactly one node, and no further.
      expect(gutterWidth(theme, minLaneWidth(theme), 1)).toBe(nodeExtent(theme) * 2);
    });

    it.each(GRAPH_THEME_IDS)('%s can always be squeezed, whatever its node size', (id) => {
      const theme = GRAPH_THEMES[id];
      // GitKraken's 30px lane already holds a 29px node, so a floor of "nodes
      // may touch but not overlap" would offer 3% of travel — a handle that
      // does nothing. Assert there is real room to drag.
      for (const lanes of [2, 5, 12]) {
        const natural = gutterWidth(theme, theme.laneWidth, lanes);
        const tightest = gutterWidth(theme, minLaneWidth(theme), lanes);
        expect(tightest).toBeLessThan(natural * 0.75);
      }
    });

    it.each(GRAPH_THEME_IDS)('%s round-trips a requested width to the pixel', (id) => {
      const theme = GRAPH_THEMES[id];
      /*
        `laneWidthForGutter` is the inverse of `gutterWidth`, and it has to be
        exact across BOTH regimes — offset-is-half-a-lane above a node's width,
        offset-pinned-to-a-radius below it. If it is only approximate the header
        label and the lanes it names drift apart by a pixel or two mid-drag,
        which reads as the table coming loose.
      */
      for (const lanes of LANE_COUNTS) {
        const min = gutterWidth(theme, minLaneWidth(theme), lanes);
        const max = gutterWidth(theme, theme.laneWidth, lanes);
        for (const step of [0, 0.25, 0.5, 0.75, 1]) {
          const asked = min + (max - min) * step;
          const painted = gutterWidth(theme, laneWidthForGutter(theme, lanes, asked), lanes);
          expect(painted).toBeCloseTo(asked, 6);
        }
      }
    });

    it.each(GRAPH_THEME_IDS)('%s refuses to draw outside the bounds it published', (id) => {
      const theme = GRAPH_THEMES[id];
      for (const lanes of LANE_COUNTS) {
        // A width from a repo with a different shape, or from a build with
        // different styles, must not produce lanes on top of each other or a
        // gutter wider than the style asked for.
        for (const asked of [-100, 0, 1, 10_000]) {
          const spacing = laneWidthForGutter(theme, lanes, asked);
          expect(spacing).toBeGreaterThanOrEqual(minLaneWidth(theme));
          expect(spacing).toBeLessThanOrEqual(theme.laneWidth);
        }
      }
    });

    it.each(GRAPH_THEME_IDS)('%s keeps its lanes in order and evenly spaced', (id) => {
      const theme = GRAPH_THEMES[id];
      for (const spacing of [minLaneWidth(theme), theme.laneWidth]) {
        const centres = [0, 1, 2, 3].map((lane) => laneCentre(theme, spacing, lane));
        for (let i = 1; i < centres.length; i += 1) {
          expect(centres[i]! - centres[i - 1]!).toBeCloseTo(spacing, 6);
        }
      }
    });
  });

  it('keeps the pre-avatar geometry the classic style exists to preserve', () => {
    // These are the module constants the graph shipped with from Phase 5 to
    // Phase 14, verbatim. Drifting them turns "the old look" into "an old-ish
    // look", which is not what anyone picking this style is asking for.
    expect(GRAPH_THEMES.classic).toMatchObject({
      rowHeight: 26,
      laneWidth: 14,
      nodeRadius: 3.5,
      strokeWidth: 1.75,
      edge: 'bezier',
      arrowheads: false,
      node: 'dot',
    });
  });
});

describe('scaleTheme', () => {
  it('leaves a style untouched at comfortable density', () => {
    for (const id of GRAPH_THEME_IDS) {
      expect(scaleTheme(GRAPH_THEMES[id], 'comfortable')).toBe(GRAPH_THEMES[id]);
    }
  });

  it('actually fits more rows on screen when compact', () => {
    // The whole point of the setting. A density that saves two pixels is a
    // preference nobody can see the effect of.
    for (const id of GRAPH_THEME_IDS) {
      const theme = GRAPH_THEMES[id];
      const compact = scaleTheme(theme, 'compact');
      expect(compact.rowHeight, id).toBeLessThan(theme.rowHeight);
      expect(theme.rowHeight - compact.rowHeight, id).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * The invariants the comfortable styles are held to, applied to the compact
   * ones — the same assertions, not a relaxed copy.
   *
   * This is the test that earns `minRowHeight`: a flat multiplier put
   * `git-graph`'s arriving segment at 3px, under `MIN_ARROW_RUN`, which renders
   * as an arrowhead overhanging the row edge above a line too short to see.
   */
  it('keeps every compact style inside its own geometry', () => {
    for (const id of GRAPH_THEME_IDS) {
      const compact = scaleTheme(GRAPH_THEMES[id], 'compact');
      expect(compact.rowHeight, `${id}: avatar crops`).toBeGreaterThanOrEqual(
        compact.avatarSize + ROW_PADDING * 2,
      );
      expect(compact.rowHeight / 2, `${id}: node overflows the row`).toBeGreaterThanOrEqual(
        nodeExtent(compact),
      );
      expect(compact.laneWidth, `${id}: lanes collide`).toBeGreaterThanOrEqual(
        nodeExtent(compact) * 2,
      );
      if (compact.arrowheads) {
        expect(arrivalRun(compact), `${id}: arrow has no segment`).toBeGreaterThanOrEqual(
          MIN_ARROW_RUN,
        );
      }
    }
  });

  it('never compresses below the floor its own geometry sets', () => {
    for (const id of GRAPH_THEME_IDS) {
      const compact = scaleTheme(GRAPH_THEMES[id], 'compact');
      expect(compact.rowHeight, id).toBeGreaterThanOrEqual(minRowHeight(compact));
    }
  });

  it('takes a base style, not one it already scaled', () => {
    // Documented as a test because it is the one way to misuse this: scaling
    // compounds, so the call site must derive from GRAPH_THEMES every render
    // rather than memoise a scaled theme and re-scale it. `graphThemeFor` is
    // the entry point that guarantees it.
    for (const id of GRAPH_THEME_IDS) {
      const once = scaleTheme(GRAPH_THEMES[id], 'compact');
      expect(scaleTheme(once, 'compact').rowHeight, id).toBeLessThanOrEqual(once.rowHeight);
    }
  });
});
