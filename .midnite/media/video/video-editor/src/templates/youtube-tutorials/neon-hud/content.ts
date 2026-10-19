import type { SceneSpec } from "../../../shared/neon-hud/Scene";

/**
 * Everything the template *says* — the only file to edit to turn it into an
 * episode. Square brackets mark a placeholder.
 *
 * The timeline is a flat list: each entry is one eight-beat slot, either a
 * `scene` (headline + diagram) or a `chapter` card. Order is time. The outro
 * is its own block because it runs longer and ends the film.
 *
 * Copy rules the reference keeps, worth keeping:
 *  - Two to four words per beat, split setup (a) / payoff (b).
 *  - The payoff is the word the narrator *lands on* — schedule it there.
 *  - Red is negation only: `aTone: "red"` on "NOT"/"NO", or a struck card.
 *  - One idea per diagram. If it needs a legend, it is two beats.
 */
export type Slot = { scene: SceneSpec } | { chapter: string };

export const CONTENT = {
  /** Shown nowhere; used for the render's file name and the README. */
  episode: "[Episode title]",

  timeline: [
    // ── Hook: four scenes, over the bed's pads (beats 0–16) and drums (16–32)
    {
      scene: {
        a: "[THE OLD WAY]",
        b: "[VS THE NEW]",
        visual: {
          kind: "compare",
          cards: [
            { title: "[old tool]", tone: "green", mark: "ring" },
            { title: "[new tool]", tone: "amber", mark: "check" },
          ],
        },
      },
    },
    {
      scene: {
        a: "[PICKS]",
        b: "[THE BEST]",
        layout: "inline",
        visual: {
          kind: "hub",
          core: "[router]",
          nodes: [
            { label: "[opt a]", value: 72 },
            { label: "[opt b]", value: 81 },
            { label: "[opt c]", value: 94 },
          ],
          pick: 2,
        },
        pill: { text: "[what it decides]" },
      },
    },
    {
      scene: {
        a: "[NOT]",
        aTone: "red",
        b: "[SLOW]",
        tone: "cyan",
        layout: "inline",
        visual: {
          kind: "compare",
          cards: [
            { title: "[heavy option]", tone: "green", struck: true },
            { title: "[other heavy]", tone: "amber", struck: true },
          ],
        },
      },
    },
    {
      scene: {
        a: "[RUNS IN]",
        b: "[MILLISECONDS]",
        visual: { kind: "stat", value: 11, unit: "ms", caption: "[what was measured]" },
      },
    },
    // ── Section change (beat 32): first chapter ─────────────────────────
    { chapter: "[Setup]" },
    {
      scene: {
        a: "[INSTALL]",
        b: "[THE CLI]",
        layout: "inline",
        visual: {
          kind: "terminal",
          title: "[~/project]",
          lines: ["$ [npm install the-tool]", "[added 1 package in 2s]", "$ [the-tool init]"],
        },
      },
    },
    {
      scene: {
        a: "[THREE]",
        b: "[STEPS]",
        layout: "inline",
        visual: {
          kind: "steps",
          steps: [
            { title: "[plan]", sub: "[what]", tone: "blue" },
            { title: "[build]", sub: "[how]", tone: "cyan" },
            { title: "[verify]", sub: "[check]", tone: "green" },
          ],
        },
      },
    },
    {
      scene: {
        a: "[SCORES]",
        b: "[EVERY OPTION]",
        visual: {
          kind: "bars",
          bars: [
            { label: "[a]", value: 54 },
            { label: "[b]", value: 61 },
            { label: "[c]", value: 88 },
            { label: "[d]", value: 70 },
          ],
          best: 2,
        },
      },
    },

    // ── Section change (beat 64): second chapter ────────────────────────
    { chapter: "[Results]" },
    {
      scene: {
        a: "[ACCURATE]",
        b: "[YET TINY]",
        layout: "inline",
        visual: { kind: "gauge", percent: 98, caption: "[accuracy]" },
        pill: { text: "[high · yet tiny]" },
      },
    },
    {
      scene: {
        a: "[LATENCY]",
        b: "[HOLDS FLAT]",
        visual: { kind: "lines", flat: "[ours]", rising: "[theirs]" },
      },
    },
    {
      scene: {
        a: "[RECAP]",
        visual: { kind: "checklist", items: ["[what you installed]", "[what you built]", "[what you measured]"] },
      },
    },
  ] satisfies Slot[],

  /** Runs over the bed's break (beat 96), twice a scene's length. */
  outro: {
    a: "[JUST BE]",
    b: "[RIGHT]",
    caption: "[CHANNEL] · [SERIES]",
    cta: "subscribe",
  },

  audio: {
    /** Under `assets/`. Swap for the episode's own bed — see `templates/.../MUSIC.md`. */
    music: "audio/music/soulprodmusic-gym-energy-514739.mp3" as string | null,
    /** Narration under `assets/` or the project's `input/`, if recorded. */
    voiceover: null as string | null,
    /** Bed level alone, and ducked under a voice-over. */
    musicVolume: 0.55,
    musicUnderVoice: 0.16,
    /** A soft whoosh on every scene change, a bigger one on chapters. */
    sfx: true,
  },
};
