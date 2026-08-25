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
} from './graph-themes';

describe('graph themes', () => {
  it('lists every declared theme exactly once', () => {
    expect([...GRAPH_THEME_IDS].sort()).toEqual(Object.keys(GRAPH_THEMES).sort());
    expect(new Set(GRAPH_THEME_IDS).size).toBe(GRAPH_THEME_IDS.length);
  });

  /**
   * The invariants the avatar-everywhere decision imposes. A fifth theme that
   * keeps a small dot from its reference screenshot breaks here rather than in a
   * screenshot nobody re-reads.
   */
  it.each(GRAPH_THEME_IDS)('%s has a row tall enough for its avatar', (id) => {
    const theme = GRAPH_THEMES[id];
    expect(theme.rowHeight).toBeGreaterThanOrEqual(theme.avatarSize + ROW_PADDING * 2);
  });

  it.each(GRAPH_THEME_IDS)('%s has a node big enough to hold its avatar', (id) => {
    const theme = GRAPH_THEMES[id];
    expect(theme.nodeRadius * 2).toBeGreaterThanOrEqual(theme.avatarSize);
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
});
