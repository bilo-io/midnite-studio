/**
 * The episode's clock — the template's, re-measured.
 *
 * The bed is `input/bed.wav`, arranged from the template's own track by
 * `scripts/make-midnite-video-1-soundtrack.mjs`. That track runs at **124.00
 * BPM**, not the 123.05 the template's `beats.ts` carries (a librosa tempo
 * bin, not a measurement): on a 123.05 grid the cuts drift six frames off the
 * kick by beat 64. The soundtrack script writes the bed with the grid's origin
 * moved to sample 0, so `ORIGIN` here is 0 and beat `b` is frame
 * `b × 14.516`. Every eight-beat slot of the bed was checked to sit within
 * 2ms of this grid.
 *
 * Retime by changing the script's `MAP` and `BPM` and this file together.
 */
export const FPS = 30;
export const BPM = 124;
export const ORIGIN = 0;

/** Frames per beat. */
export const BEAT = (FPS * 60) / BPM;
/** One scene (or chapter card): eight beats. */
export const SCENE_BEATS = 8;
/** The outro: the track's own tail, after drop B ends on beat 208. */
export const OUTRO_BEATS = 24;

export const beatAt = (b: number): number => Math.round(ORIGIN + b * BEAT);
