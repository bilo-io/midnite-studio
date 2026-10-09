/**
 * The template's clock — every frame number in it comes from `bar()`.
 *
 * The go-live promo cuts to a measured bar grid (`projects/.../001-golive-promo/
 * beats.ts`): one bar is 51.08 frames at 30fps, and every cut, wipe, typed
 * line and reveal sits on a bar or a fraction of one. The template keeps the
 * same tempo so its timings read the way the promo's do, and starts the grid
 * at 0 because it has no track to line up with.
 *
 * **Retiming for a real track:** run `node tools/audio-envelope.mjs <track>
 * --onsets`, set `BAR` and `ORIGIN` from what it measures, and every section
 * below moves with them. Nothing else in the template holds a bare frame number.
 */
export const FPS = 30;
export const BAR = 51.0808;
export const ORIGIN = 0;

export const bar = (b: number): number => Math.round(ORIGIN + b * BAR);

/** Where each part of the showcase lands. */
export const T = {
  /** The mark alone on black, glowing. */
  intro: 0,
  /** The name unfurls out of the mark and the qualifier is typed. */
  lockup: bar(1),
  /** The first hit: the long wipe to the light stage, and the first claim. */
  claims: [bar(2), bar(3), bar(4), bar(5)] as const,
  /** One sentence, said across a change of stage: dark half, light half. */
  statement: [bar(6), bar(7)] as const,
  /** The breath before the drop: the mark back to centre, motes pulled in. */
  breath: bar(8),
  /** The motes reach the mark. */
  implode: bar(8.85),
  /** The drop: a short wipe to dark, a shimmer across the stage, typed slugs. */
  drop: bar(9),
  slugs: [bar(9.25), bar(9.5), bar(9.75)] as const,
  /** Coloured cards, one every half bar. */
  loops: [bar(10.5), bar(11), bar(11.5)] as const,
  /** A claim back on the light stage. */
  late: bar(12),
  /** The outro, on dark: "connect with" and a row of names. */
  connect: bar(13),
  /** The lockup the film ends on. */
  end: bar(14),
  /** Last frame + 1. */
  duration: bar(15.5),
} as const;
