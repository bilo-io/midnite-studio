import { describe, expect, it } from 'vitest';

import { LANE_COLOR_COUNT, laneHsl } from './lane-colors';

/**
 * The lane palette's accessibility guard.
 *
 * A commit graph's whole proposition is that two branches are two colours. If
 * two lanes are indistinguishable the graph is not merely less pretty — it is
 * actively misleading, because the reader has no way to know that the line they
 * are tracing changed identity halfway down.
 *
 * So this measures rather than eyeballs, and it measures under simulated
 * colour-vision deficiency as well as normal vision. Around 8% of men have some
 * form of red–green deficiency; a palette checked only by someone without one
 * is a palette checked for 92% of its users.
 *
 * The numbers it enforces were established by running it against the palette it
 * was written for — see `WORST_PAIR` below for what the previous palette scored
 * and why it had to change.
 */

type Rgb = [number, number, number];
type Lab = [number, number, number];

const hslToRgb = ([h, s, l]: readonly [number, number, number]): Rgb => {
  const sat = s / 100;
  const lum = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sat * Math.min(lum, 1 - lum);
  const f = (n: number): number =>
    lum - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

const toLinear = ([r, g, b]: Rgb): Rgb => {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [lin(r), lin(g), lin(b)];
};

/**
 * OKLab, not CIELAB or a raw RGB distance.
 *
 * Euclidean distance in OKLab tracks perceived difference closely enough that a
 * single threshold means the same thing for a yellow pair as for a blue one —
 * which is the property a palette-wide assertion needs and the one sRGB
 * distance most conspicuously lacks.
 */
const oklab = ([r, g, b]: Rgb): Lab => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

/**
 * Viénot–Brettel–Mollon dichromat simulation matrices, applied to LINEAR sRGB.
 *
 * Applying them to gamma-encoded values instead is the classic way to get a
 * simulation that looks plausible and understates the collisions — which would
 * make this test pass for the wrong reason, the worst outcome available to it.
 */
const SIMULATIONS = {
  normal: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protan: [
    [0.11238, 0.88762, 0],
    [0.11238, 0.88762, 0],
    [0.00401, -0.00401, 1],
  ],
  deutan: [
    [0.29275, 0.70725, 0],
    [0.29275, 0.70725, 0],
    [-0.02234, 0.02234, 1],
  ],
  tritan: [
    [1, 0.14461, -0.14461],
    [0, 0.85659, 0.14341],
    [0, 0.85659, 0.14341],
  ],
} as const satisfies Record<string, readonly (readonly number[])[]>;

type Vision = keyof typeof SIMULATIONS;

const simulate = (vision: Vision, [r, g, b]: Rgb): Rgb => {
  const m = SIMULATIONS[vision];
  return [
    m[0]![0]! * r + m[0]![1]! * g + m[0]![2]! * b,
    m[1]![0]! * r + m[1]![1]! * g + m[1]![2]! * b,
    m[2]![0]! * r + m[2]![1]! * g + m[2]![2]! * b,
  ];
};

const perceived = (colorIdx: number, vision: Vision, palette: 'vivid' | 'muted' = 'vivid'): Lab =>
  oklab(simulate(vision, toLinear(hslToRgb(laneHsl(colorIdx, palette)))));

const separation = (a: Lab, b: Lab): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Every unordered pair of lane indices. */
const PAIRS: [number, number][] = [];
for (let i = 0; i < LANE_COLOR_COUNT; i += 1) {
  for (let j = i + 1; j < LANE_COLOR_COUNT; j += 1) PAIRS.push([i, j]);
}

/** The closest two lanes get, under one kind of vision. */
function worstPair(vision: Vision, palette: 'vivid' | 'muted' = 'vivid') {
  let worst = { distance: Infinity, pair: [0, 0] as [number, number] };
  for (const pair of PAIRS) {
    const distance = separation(
      perceived(pair[0], vision, palette),
      perceived(pair[1], vision, palette),
    );
    if (distance < worst.distance) worst = { distance, pair };
  }
  return worst;
}

/**
 * Floors, in OKLab distance.
 *
 * Not plucked from the air: the palette these were written against scores 0.089
 * at its worst under normal vision and 0.068 at its worst under any simulated
 * deficiency, so each floor sits just under the measured value with enough room
 * that a small hue nudge does not trip it. Tightening them further would be a
 * deliberate act, and a visible one.
 *
 * For scale, ~0.02 is roughly a just-noticeable difference on adjacent patches;
 * these are lanes several rows apart in a busy table, which is a much harder
 * comparison than two swatches side by side.
 */
const MIN_NORMAL = 0.085;
const MIN_DEFICIENT = 0.065;

/**
 * What the palette REPLACED in Phase 12 Theme F scored, kept as the reason this
 * file exists. Its violet and indigo were 0.0097 apart under protanopia — seven
 * times below the floor, and visually one colour.
 */
const WORST_PAIR = { previousProtanViolet: 0.0097 };

describe('lane palette separation', () => {
  it('keeps every pair of lanes apart under normal vision', () => {
    const worst = worstPair('normal');
    expect(
      worst.distance,
      `lanes ${worst.pair[0]} and ${worst.pair[1]} are ${worst.distance.toFixed(4)} apart`,
    ).toBeGreaterThan(MIN_NORMAL);
  });

  it.each(['protan', 'deutan', 'tritan'] as const)(
    'keeps every pair of lanes apart under simulated %s vision',
    (vision) => {
      const worst = worstPair(vision);
      expect(
        worst.distance,
        `lanes ${worst.pair[0]} and ${worst.pair[1]} collapse to ${worst.distance.toFixed(4)} under ${vision}`,
      ).toBeGreaterThan(MIN_DEFICIENT);
    },
  );

  it('holds up in the muted palette too', () => {
    // `muted` halves saturation, which is exactly the axis a dichromat has
    // least of — so it is the palette most at risk, not the safe one.
    for (const vision of ['protan', 'deutan', 'tritan'] as const) {
      const worst = worstPair(vision, 'muted');
      expect(
        worst.distance,
        `muted lanes ${worst.pair[0]}/${worst.pair[1]} collapse to ${worst.distance.toFixed(4)} under ${vision}`,
      ).toBeGreaterThan(0.03);
    }
  });

  it('is a real improvement on the palette it replaced', () => {
    // Guards the reason for the change, not just the change: if a future edit
    // drifts back toward a single-lightness palette this is what says so.
    expect(worstPair('protan').distance).toBeGreaterThan(WORST_PAIR.previousProtanViolet * 5);
  });
});

describe('lane palette lightness', () => {
  /**
   * The palette must span a range of perceived lightness, and that is a
   * requirement rather than an accident. Deficiency collapses hue; lightness is
   * the channel that survives it, so a palette with a flat lightness profile
   * has spent its entire separation budget on the one axis its users may not
   * have. The previous palette sat inside 0.63–0.77 and that is precisely why
   * it failed the tests above.
   */
  it('spreads the lanes across a usable lightness range', () => {
    const lightness = Array.from({ length: LANE_COLOR_COUNT }, (_, i) => perceived(i, 'normal')[0]);
    expect(Math.max(...lightness) - Math.min(...lightness)).toBeGreaterThan(0.2);
  });

  it('keeps every lane readable against both the light and the dark ground', () => {
    // Below the floor a lane disappears into the dark theme; above the ceiling
    // it washes out on the light one. One palette serves both, so it has to
    // clear both — which is what bounds the spread asserted just above.
    for (let index = 0; index < LANE_COLOR_COUNT; index += 1) {
      const [lightness] = perceived(index, 'normal');
      expect(lightness, `lane ${index}`).toBeGreaterThan(0.5);
      expect(lightness, `lane ${index}`).toBeLessThan(0.85);
    }
  });
});
