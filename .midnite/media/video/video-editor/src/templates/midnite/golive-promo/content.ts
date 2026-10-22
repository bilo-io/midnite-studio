/**
 * Everything the template *says*, in one file — the only file to edit to turn
 * the showcase into a first cut.
 *
 * Square brackets mark a placeholder. Each shot is a label, not a clip: the
 * template draws a title card naming what to record, in the place and at the
 * size the recording will occupy. Swap a card for footage by giving the claim
 * an `AppWindow` (see `shared/AppWindow.tsx` and the promo's `clips.ts`).
 */
import type { SceneSpec } from "../../../shared/neon-hud/Scene";

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

  /**
   * The neon-HUD kit's grammar on midnite's stages: a chapter card, then one
   * scene per diagram kind (`shared/neon-hud/Visuals.tsx`), a bar each. Line A
   * is the setup, line B the payoff in the scene's tone; `say` is a spoken
   * line captioned under the picture.
   */
  chapter: "[Chapter title]",
  hud: [
    {
      a: "[SETUP]",
      b: "[PAYOFF]",
      tone: "red",
      visual: { kind: "compare", cards: [{ title: "[the old way]", tone: "green", struck: true }, { title: "[the new way]", tone: "amber", mark: "check" }] },
      pill: { text: "[compare]" },
    },
    { a: "[ONE NUMBER]", b: "[THAT COUNTS]", visual: { kind: "stat", value: 100, unit: "K", caption: "[what it counts]" } },
    {
      a: "[ONE CORE]",
      b: "[ROUTES IT]",
      visual: { kind: "hub", core: "[core]", nodes: [{ label: "[a]" }, { label: "[b]" }, { label: "[c]" }, { label: "[d]" }], pick: 2 },
      pill: { text: "[hub]" },
    },
    { a: "[A RATIO]", b: "[ON A RING]", visual: { kind: "gauge", percent: 40, caption: "[gauge]" } },
    {
      a: "[SIDE BY SIDE]",
      b: "[ONE WINS]",
      visual: { kind: "bars", bars: [{ label: "[a]", value: 40 }, { label: "[b]", value: 65 }, { label: "[c]", value: 90 }], best: 2 },
    },
    { a: "[FLAT]", b: "[VS CLIMBING]", tone: "amber", visual: { kind: "lines", flat: "[ours]", rising: "[theirs]" } },
    {
      a: "[TYPED]",
      b: "[IN A TERMINAL]",
      layout: "inline",
      visual: { kind: "terminal", title: "~/[repo]", lines: ["$ /[command]", "[what it prints]"] },
      say: "[A spoken line, captioned under the picture.]",
    },
    {
      a: "[IN]",
      b: "[THREE STEPS]",
      layout: "inline",
      visual: { kind: "steps", steps: [{ title: "[one]", sub: "[sub]" }, { title: "[two]", sub: "[sub]" }, { title: "[three]", sub: "[sub]", tone: "cyan" }] },
    },
    { a: "[TICKED]", b: "[OFF]", tone: "green", visual: { kind: "checklist", items: ["[first item]", "[second item]"] } },
    { a: "[NOTHING]", aTone: "red", b: "[UNDER IT]", visual: { kind: "none" }, say: "[A beat with no diagram, only the line.]" },
    { a: "[AND IT'S]", b: "[DONE]", tone: "green", visual: { kind: "badge", caption: "[closing badge]" } },
  ] satisfies readonly (SceneSpec & { say?: string })[],

  /** The outro. Lower case, in the titles' font. */
  connect: "connect with",
  names: ["[Integration]", "[Integration]", "[Integration]", "[Integration]"],
  cta: "[Call to action]",
} as const;
