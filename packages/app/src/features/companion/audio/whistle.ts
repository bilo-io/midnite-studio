import {
  COMPANION_WHISTLE_MELODIES,
  MELODY_REST,
  midiToFrequency,
  type CompanionMelody,
} from '@midnite/studio-shared';

import { getCompanionAudio, noteCompanionAudioActivity } from './context';

/**
 * A whistled tune, from two oscillators and an envelope (Phase 79 Theme G).
 *
 * Two, because one is not a whistle. A bare sine is a test tone; what makes it
 * read as *whistling* is the small pitch wobble a human cannot help — so a
 * second, very slow oscillator drives the first one's `detune`, which is a
 * vibrato in the only place vibrato belongs. Everything else is one gain
 * envelope with a soft attack and release, because a square-edged note on a
 * sine sounds like a click.
 *
 * The melodies themselves are `[midi, beats][]` in `shared` with their own
 * tests (the phase's "melody encoder against a golden set of frequencies").
 * Nothing here is an asset.
 *
 * **Scheduled, then forgotten.** Every note's start and stop is booked on the
 * audio clock in one pass and the nodes stop themselves; there is no timer, no
 * per-note callback and nothing to tick. A whistle costs one burst of
 * scheduling and then nothing until it ends, which is what keeps the idle
 * measurement honest.
 */

/** Vibrato: ~5 Hz, ±14 cents. Enough to be human, little enough not to be a siren. */
export const WHISTLE_VIBRATO_HZ = 5;
export const WHISTLE_VIBRATO_CENTS = 14;

/** Envelope, as a fraction of each note's length. */
const ATTACK = 0.12;
const RELEASE = 0.3;
/** Per-note peak. Well under 1 so the master gain has headroom for the slider. */
const PEAK = 0.16;

export type WhistleHandle = {
  /** Stop this whistle. Safe to call after it has already finished. */
  stop: () => void;
};

/**
 * Play one melody, returning a handle that can cut it short.
 *
 * `null` when there is no audio context at all (jsdom, a stripped embedder) —
 * callers treat a silent whistle as a normal outcome, never an error.
 */
export function playWhistle(melody: CompanionMelody): WhistleHandle | null {
  const audio = getCompanionAudio();
  if (audio === null) return null;

  const { ctx, master } = audio;
  const secondsPerBeat = 60 / (melody.bpm > 0 ? melody.bpm : 90);
  /*
    A small lead-in rather than `currentTime` exactly: the first note's attack
    ramp has to start in the future or the browser clamps it to "now" and the
    note begins at full volume, which is the click the envelope exists to
    avoid.
  */
  let at = ctx.currentTime + 0.05;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(master);

  const tone = ctx.createOscillator();
  tone.type = 'sine';

  const vibrato = ctx.createOscillator();
  vibrato.type = 'sine';
  vibrato.frequency.value = WHISTLE_VIBRATO_HZ;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = WHISTLE_VIBRATO_CENTS;
  vibrato.connect(vibratoDepth);
  // Into `detune`, not `frequency`: cents are pitch-relative, so the same
  // wobble depth reads identically on a low note and a high one.
  vibratoDepth.connect(tone.detune);
  tone.connect(gain);

  const startedAt = at;
  for (const [midi, beats] of melody.notes) {
    const length = Math.max(0.01, beats * secondsPerBeat);
    if (midi === MELODY_REST || midi < 0) {
      // A rest is silence the envelope is already at — nothing to schedule,
      // which is why `midiToFrequency` answering 0 needs no branch of its own
      // beyond this one.
      at += length;
      continue;
    }
    tone.frequency.setValueAtTime(midiToFrequency(midi), at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(PEAK, at + length * ATTACK);
    gain.gain.setValueAtTime(PEAK, at + length * (1 - RELEASE));
    gain.gain.linearRampToValueAtTime(0, at + length);
    at += length;
  }

  tone.start(startedAt);
  vibrato.start(startedAt);
  tone.stop(at + 0.05);
  vibrato.stop(at + 0.05);
  noteCompanionAudioActivity();

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try {
        // A short ramp rather than a hard stop: cutting a sine mid-cycle is an
        // audible pop, and "stops instantly" is allowed 30 ms of manners.
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.03);
        tone.stop(ctx.currentTime + 0.04);
        vibrato.stop(ctx.currentTime + 0.04);
      } catch {
        // Already stopped by its own schedule. Nothing to do.
      }
    },
  };
}

let active: WhistleHandle | null = null;
let lastIndex = -1;

/**
 * Whistle one of the five, avoiding the one just played.
 *
 * Avoided rather than shuffled for the reason `pickPhrase` gives about the
 * words: the same tune twice in a row is the thing a listener notices, and
 * anything further back they do not.
 */
export function whistle(rng: () => number = Math.random): WhistleHandle | null {
  stopWhistle();
  const count = COMPANION_WHISTLE_MELODIES.length;
  let index = Math.min(count - 1, Math.max(0, Math.floor(rng() * count)));
  if (index === lastIndex && count > 1) index = (index + 1) % count;
  lastIndex = index;

  active = playWhistle(COMPANION_WHISTLE_MELODIES[index] as CompanionMelody);
  return active;
}

export function stopWhistle(): void {
  active?.stop();
  active = null;
}

/** Reset module state. Tests only. */
export function __resetWhistleForTest(): void {
  active = null;
  lastIndex = -1;
}
