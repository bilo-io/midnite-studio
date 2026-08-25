import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRAPH_THEME,
  GRAPH_THEMES,
  GRAPH_THEME_IDS,
  ROW_PADDING,
  MIN_ARROW_RUN,
  arrivalRun,
  graphTheme,
  nodeExtent,
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

  it.each(GRAPH_THEME_IDS)('%s keeps adjacent nodes apart', (id) => {
    const theme = GRAPH_THEMES[id];
    // `laneWidth` is centre-to-centre and `nodeExtent` is the painted radius
    // including the ring, so anything narrower than twice it puts two faces on
    // top of each other. The first version of this asserted 0.75x the avatar
    // — which every theme passed while every theme overlapped.
    expect(theme.laneWidth).toBeGreaterThanOrEqual(nodeExtent(theme) * 2);
  });

  it.each(GRAPH_THEME_IDS)('%s keeps lane 0 inside the gutter', (id) => {
    const theme = GRAPH_THEMES[id];
    // Lane 0's centre is half a lane in; the row SVG is `overflow-visible`, so
    // a node wider than that bleeds into the BRANCH / TAG column.
    expect(theme.laneWidth / 2).toBeGreaterThanOrEqual(nodeExtent(theme));
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
