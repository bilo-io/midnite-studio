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
   * rather than a line, so it is the one place the label can be unreadable.
   *
   * Asserted as a contrast RATIO rather than against the flip rule, so the test
   * cannot agree with the implementation about a threshold that is itself
   * wrong — which is exactly what happened while `laneInk` keyed on the HSL
   * lightness component: the old test restated `l >= 58` and passed while
   * handing white ink to the palette's brightest colour.
   */
  it('picks the ink that actually reads on the fill', () => {
    for (let index = 0; index < LANE_COLOR_COUNT; index += 1) {
      for (const palette of ['vivid', 'muted'] as const) {
        const ink = laneInk(index, palette);
        const ratio = contrast(inkLuminance(ink), luminance(laneHsl(index, palette)));
        // 4.5:1 is AA for body text; these are 11px semibold chips, so the bar
        // is AA-large (3:1) plus a margin rather than a bare pass.
        expect(
          ratio,
          `lane ${index} (${palette}) ink ${ink} scores ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThan(3.5);
      }
    }
  });

  it('never picks the worse of the two candidate inks', () => {
    for (let index = 0; index < LANE_COLOR_COUNT; index += 1) {
      const [h] = laneHsl(index);
      const fill = luminance(laneHsl(index));
      const chosen = contrast(inkLuminance(laneInk(index)), fill);
      const white = contrast(1, fill);
      const dark = contrast(luminance([h, 70, 12]), fill);
      expect(chosen).toBe(Math.max(white, dark));
    }
  });

  it('picks the ink for the palette it was asked about', () => {
    // `muted` shifts both saturation and lightness, so a lane can want white in
    // one palette and dark ink in the other. Reading the wrong one is a silent
    // contrast bug — invisible except on the one chip that has it.
    for (let index = 0; index < LANE_COLOR_COUNT; index += 1) {
      if (laneInk(index, 'vivid') === laneInk(index, 'muted')) continue;
      const vivid = luminance(laneHsl(index, 'vivid'));
      const muted = luminance(laneHsl(index, 'muted'));
      expect(vivid).not.toBeCloseTo(muted, 3);
    }
  });
});

/** WCAG relative luminance of an HSL triple. */
function luminance([h, s, l]: [number, number, number]): number {
  const sat = s / 100;
  const lum = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sat * Math.min(lum, 1 - lum);
  const f = (n: number): number =>
    lum - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
}

const contrast = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Parse the two shapes `laneInk` can return back into a luminance. */
function inkLuminance(ink: string): number {
  if (ink === 'hsl(0 0% 100%)') return 1;
  const match = /^hsl\((\d+(?:\.\d+)?) 70% 12%\)$/.exec(ink);
  if (!match) throw new Error(`unrecognised ink: ${ink}`);
  return luminance([Number(match[1]), 70, 12]);
}

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
