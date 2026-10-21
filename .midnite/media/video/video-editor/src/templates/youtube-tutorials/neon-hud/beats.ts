/**
 * The template's clock. The reference's bed runs at ~123 BPM and its scenes
 * last a median 3.45s (measured from the fade-through-black between them) —
 * about seven beats, paced to the narration rather than to the bar.
 *
 * The template rounds that to **eight beats (3.9s)** so scenes sit on the
 * bed's 16-beat phrases: chapter cards land on its section changes and the
 * outro lands on its break. An episode with narration can give any scene its
 * own `beats` to follow the voice instead.
 *
 * The placeholder bed, `soulprodmusic-gym-energy`, measures 123.05 BPM with
 * its grid starting at frame 0 (period 0.4876s, librosa beat_track), so the
 * template keeps that tempo exactly. Its shape is what the sections are hung
 * on (beats): pads only to 16, drums in at 16, a new section at 32 and at 64,
 * the break at 96, back in at ~112.
 *
 * **Retiming for another track:** run `node tools/audio-envelope.mjs <track>
 * --onsets`, set `BPM` and `ORIGIN` (in frames), and everything moves.
 */
export const FPS = 30;
export const BPM = 123.05;
export const ORIGIN = 0;

/** Frames per beat. */
export const BEAT = (FPS * 60) / BPM;
/** One scene (or chapter card): eight beats. */
export const SCENE_BEATS = 8;
/** The outro runs over the bed's break. */
export const OUTRO_BEATS = 16;

export const beatAt = (b: number): number => Math.round(ORIGIN + b * BEAT);
