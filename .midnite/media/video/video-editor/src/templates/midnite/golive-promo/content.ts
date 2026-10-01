/**
 * Everything the template *says*, in one file — the only file to edit to turn
 * the showcase into a first cut.
 *
 * Square brackets mark a placeholder. Each shot is a label, not a clip: the
 * template draws a title card naming what to record, in the place and at the
 * size the recording will occupy. Swap a card for footage by giving the claim
 * an `AppWindow` (see `shared/AppWindow.tsx` and the promo's `clips.ts`).
 */
export const CONTENT = {
  /** The word after "Midnite" in the lockup. */
  qualifier: "Studio",

  /** Four claims, a bar each, alternating stage. */
  claims: [
    { title: "[Claim one]", shot: "[Recording: the feature doing it]" },
    { title: "[Claim two]", shot: "[Recording: a second feature]" },
    { title: "[Claim three, on dark]", shot: "[Recording: dark-theme take]" },
    { title: "[Claim four, back on light]", shot: "[Recording: light-theme take]" },
  ],

  /** One sentence in two halves — the first on dark, the second on light. */
  statement: ["[First half]", "[Second half!]"] as const,

  /** Typed over a centred card after the drop. */
  slugs: ["/[first]", "/[second]", "/[third]"] as const,
  slugsTitle: "[Section after the drop]",
  slugsShot: "[Recording: behind the slugs]",

  /** Coloured cards: a loop's slug from `shared/loopIcons.tsx` and one line of copy. */
  loops: [
    { slug: "guard", blurb: "[what it does]" },
    { slug: "concepts", blurb: "[what it does]" },
    { slug: "develop", blurb: "[what it does]" },
  ],

  late: { title: "[A claim on light again]", shot: "[Recording: light take]" },

  /** The outro. Lower case, in the titles' font. */
  connect: "connect with",
  names: ["[Integration]", "[Integration]", "[Integration]", "[Integration]"],
  cta: "[Call to action]",
} as const;
