/**
 * The episode's two cuts: the same 26 slots, the same picture, two songs.
 *
 * Plain data with no imports, because `scripts/make-midnite-video-1-voiceover.mjs`
 * loads this file directly (Node strips the types) to place each spoken line
 * on its slot. Every time here is in **beats** of the cut's own track; `beat`
 * turns one into frames. Both grids start at frame 0.
 *
 * ── `bed` — v4 onwards, the neon-HUD template's song ────────────────────────
 *
 * `input/bed.wav` at 124.00 BPM (see `beats.ts` and the soundtrack script):
 * eight beats a slot, the outro on beat 208, chapter cards on the phrase starts
 * 32, 80 and 144. Identical to v3's timing, so v3's voice-over still fits.
 *
 * ── `ironAria` — the go-live promo's song ───────────────────────────────────
 *
 * `The_Iron_Aria` at 140.95 BPM: a bar of four beats is 51.0808 frames, as
 * measured for the promo (`projects/midnite/marketing/001-golive-promo/beats.ts`).
 * The track is 98.9 s and the film needs more, so
 * `scripts/make-midnite-video-1-iron-aria.mjs` plays it from its bar −9 (0.12 s
 * in) to bar 40, then jumps back to the drop at bar 18 and plays on to bar 44 —
 * the second half twice, spliced on bar lines. In film bars (0 = the track's
 * bar −9) that puts the track's hits here:
 *
 *    film bar  9  the first hit         → chapter 1, the long wipe to light
 *             27  the drop              → chapter 2, wipe to dark + shimmer
 *             45  the loudest onset     → the statement slot
 *             47  the last boom
 *             49  the drop again        → chapter 3, wipe to dark + shimmer
 *             62  the breakdown, 63 the return
 *             67  the loudest onset again, 69 the last boom → the outro
 *
 * Slots are two bars, or three where the spoken line needs it: a line runs at
 * up to 1.22× to fit two bars and gets three when it would need more.
 */
export type Cut = {
  /** Frames per beat. */
  beat: number;
  /** Where each slot starts, in beats — one per timeline slot. */
  slots: readonly number[];
  /** The outro's first beat, and the film's last beat + 1. */
  outro: number;
  end: number;
  /** Slots the music drops on: a shimmer across the stage with the wipe. */
  drops: readonly number[];
  /** The slot whose last beats are the golive breath: the mark to centre, motes pulled in. */
  breath: number;
  /** The slot the stock riser peaks on, if any. */
  riser: number | null;
  audio: {
    /** In the project's `input/`. */
    music: string;
    voiceover: string;
    musicVolume: number;
    /** The music's level under the voice, which runs from frame 0 to the outro. */
    musicUnderVoice: number;
    riserVolume: number;
  };
};

const BED_BEAT = (30 * 60) / 124;
const ARIA_BEAT = 51.0808 / 4;

/** Film bars for the Iron Aria cut's slots (see above), as beats. */
/* From v11 the recap (slot 25) has three bars for its five skills; the scratchpad line gives one up. */
const ARIA_SLOT_BARS = [0, 2, 4, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 47, 49, 51, 54, 57, 60, 62, 64, 67];

export const CUTS = {
  bed: {
    beat: BED_BEAT,
    slots: Array.from({ length: 26 }, (_, i) => i * 8),
    outro: 208,
    end: 232,
    drops: [4, 18],
    breath: 17,
    riser: 18,
    audio: {
      music: "bed.wav",
      voiceover: "voiceover.wav",
      /*
        0.55, the neon template's level, over the soundtrack script's headroom
        scale (×0.6917): the bed is written 3.2 dB down so the source's overs
        no longer clip, and played back up by the same amount.
      */
      musicVolume: 0.55 / 0.6917,
      /* The template's 0.16 under a voice, +5 dB to match the voice's −16 LUFS. */
      musicUnderVoice: (0.16 * 1.78) / 0.6917,
      /*
        0.3 until v3, where the stock riser's last 1.5 s (1:07.6–1:09) reached
        −19.7 LUFS — level with the voice saying "the whole point" over it, while
        the ducked bed under that line sits near −28. At 0.1 it is ~10 dB under
        the voice and still swells into drop B.
      */
      riserVolume: 0.1,
    },
  },
  ironAria: {
    beat: ARIA_BEAT,
    slots: ARIA_SLOT_BARS.map((b) => b * 4),
    outro: 69 * 4,
    end: 75 * 4,
    drops: [10, 18],
    breath: 9,
    riser: null,
    audio: {
      music: "iron-aria.wav",
      voiceover: "voiceover-iron-aria.wav",
      /*
        Measured on the written cut: −13.9 LUFS under the voice (0–1:57), −16.6
        over the outro. The bed's duck puts its music at −22.9 under the −16
        voice, so this one is −9 dB there to sit the same 7 dB under it, and
        plays at full level over the outro.
      */
      musicVolume: 1,
      musicUnderVoice: 0.355,
      /* The track brings its own build into each drop; the stock riser stays out. */
      riserVolume: 0,
    },
  },
} satisfies Record<string, Cut>;

export type CutId = keyof typeof CUTS;

export const frameAt = (cut: Cut, beat: number): number => Math.round(beat * cut.beat);
