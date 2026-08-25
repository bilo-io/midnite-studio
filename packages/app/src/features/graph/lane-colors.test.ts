import { describe, expect, it } from 'vitest';

import { LANE_COLOR_COUNT, laneColor, laneHsl, laneInk, laneVars } from './lane-colors';

describe('laneHsl', () => {
  it('is what laneColor is assembled from', () => {
    // The two must not drift: a chip built from the components and a lane drawn
    // from the string are meant to be the same colour, and nothing else checks
    // that they still are.
    for (let index = 0; index < LANE_COLOR_COUNT; index += 1) {
      const [h, s, l] = laneHsl(index);
      expect(laneColor(index)).toBe(`hsl(${h} ${s}% ${l}%)`);
    }
  });

  it('keeps the hue and pulls back only the saturation when muted', () => {
    // The point of deriving `muted` rather than hand-tuning a second array: a
    // branch stays recognisably the same colour whichever style you are in.
    for (let index = 0; index < LANE_COLOR_COUNT; index += 1) {
      const [vividH, vividS] = laneHsl(index, 'vivid');
      const [mutedH, mutedS] = laneHsl(index, 'muted');
      expect(mutedH).toBe(vividH);
      expect(mutedS).toBeLessThan(vividS);
    }
  });

  it('wraps rather than falling off the end of the palette', () => {
    expect(laneHsl(LANE_COLOR_COUNT)).toEqual(laneHsl(0));
    expect(laneHsl(LANE_COLOR_COUNT * 3 + 4)).toEqual(laneHsl(4));
  });
});

describe('laneInk', () => {
  /**
   * The checked-out chip is the one place a lane colour becomes a solid fill
   * rather than a line, so it is the one place the label can be unreadable. The
   * palette straddles the flip point — white reads on the 45% green and does
   * not on the 65% violet — which is why this is a function and not a constant.
   */
  it('flips to a dark ink once the lane is too pale for white', () => {
    for (let index = 0; index < LANE_COLOR_COUNT; index += 1) {
      const [, , lightness] = laneHsl(index);
      const ink = laneInk(index);
      if (lightness >= 58) expect(ink).not.toBe('hsl(0 0% 100%)');
      else expect(ink).toBe('hsl(0 0% 100%)');
    }
  });

  it('picks the ink for the palette it was asked about', () => {
    // `muted` shifts lightness down, so a lane can want white in one palette
    // and dark ink in the other. Reading the wrong one is a silent contrast bug.
    const flipped = Array.from({ length: LANE_COLOR_COUNT }, (_, i) => i).filter(
      (i) => laneInk(i, 'vivid') !== laneInk(i, 'muted'),
    );
    for (const index of flipped) {
      expect(laneHsl(index, 'vivid')[2]).toBeGreaterThanOrEqual(58);
      expect(laneHsl(index, 'muted')[2]).toBeLessThan(58);
    }
  });
});

describe('laneVars', () => {
  it('publishes the three components the stylesheet composes', () => {
    const [h, s, l] = laneHsl(3);
    expect(laneVars(3)).toEqual({
      '--lane-h': `${h}`,
      '--lane-s': `${s}%`,
      '--lane-l': `${l}%`,
    });
  });

  it('does not publish a lightness for the label', () => {
    // `--lane-ink-l` is the app theme's, set in styles.css — a chip that
    // shipped its own would be a pastel on paper in light theme.
    expect(laneVars(0)).not.toHaveProperty('--lane-ink-l');
  });
});
