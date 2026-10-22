/**
 * The film's one cut: midnite video 1's song (the gym-energy bed) on v11's
 * template, with a dubstep remix in its second half.
 *
 * Plain data with no imports, because `scripts/make-midnite-apps-voiceover.mjs`
 * loads this file directly (Node strips the types) to place each spoken line on
 * its slot. Every time here is in **beats** of `input/bed.wav` at 124.00 BPM;
 * `frameAt` turns one into frames. The grid starts at frame 0.
 *
 * `scripts/make-midnite-apps-soundtrack.mjs` arranges the bed to 376 beats
 * (5458 frames, 3:01.9; v1 was 264, v11's length): video 1's song through
 * chapter 3, then the breakdown again under a synthesized build, a dubstep
 * drop (`scripts/midnite-apps-dubstep.mjs`), and back to the song for the
 * recap and its own ending. Eight beats a slot, so in beats:
 *
 *      0  hook (intro pads, light kick from 16)       — the website
 *     32  drop A                                      → chapter 1, the launcher
 *     80  drop A's last phrase                        → chapter 2, agents at work
 *    128  the breakdown                               → the statement
 *    136  the riser                                   → the breath
 *    144  drop B                                      → chapter 3, app to app
 *    208  drop B's second half again                  → the rest of chapter 3
 *    240  the breakdown again, under the build        → the second statement
 *    264  the build's last bar, then a half-beat gap  → the second breath
 *    272  the dubstep drop, sixteen bars half-time    → chapter 4, the whole suite
 *    336  back to the song: drop B's last phrase      → the recap
 *    352  the track's own tail                        → the outro
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
  /** Slots whose last beats are the golive breath: the mark to centre, motes pulled in. */
  breath: readonly number[];
  /** Slots the stock riser peaks on. */
  riser: readonly number[];
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

export const CUTS = {
  bed: {
    beat: BED_BEAT,
    slots: Array.from({ length: 44 }, (_, i) => i * 8),
    outro: 352,
    end: 376,
    drops: [4, 18, 34],
    breath: [17, 33],
    /* The dubstep drop has the bed's own build into it, so the stock riser is for drop B alone. */
    riser: [18],
    audio: {
      music: "bed.wav",
      voiceover: "voiceover.wav",
      /* Video 1's levels: the soundtrack script's headroom scale (×0.6917) undone. */
      musicVolume: 0.55 / 0.6917,
      musicUnderVoice: (0.16 * 1.78) / 0.6917,
      riserVolume: 0.1,
    },
  },
} satisfies Record<string, Cut>;

export type CutId = keyof typeof CUTS;

export const frameAt = (cut: Cut, beat: number): number => Math.round(beat * cut.beat);

export const FPS = 30;
