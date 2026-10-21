// @ts-check
/**
 * Open world sound beds, synthesized on the sfx player's AudioContext: a tyre screech for slides, the rain
 * wash, and the birds by day and crickets by night. They are continuous or randomly timed, so they do not
 * fit the one-shot presets in `kit/core/sfx.js`; they live here, with the genre. The car's engine and the
 * wind are the kit's own looping presets (`engine-loop`, `ambience-wind`), which `../scenes/level.js` starts
 * and retunes with `sfx.loop(...).set(...)`.
 * Without an AudioContext, or before the first key press unlocks it, every call is a harmless no-op.
 */

import { fillNoise } from 'kit/core/sfx.js';

import { ambienceMix } from './sound-math.js';

/**
 * @param {{ context: AudioContext | null, rng: { next(): number } }} options `rng` is a kit rng, so birdsong is the same every replay
 */
export function createSoundBeds({ context, rng }) {
  const ctx = context;
  const stub = { update() {}, setVolume() {}, dispose() {} };
  if (!ctx) return stub;
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  const loop = (/** @type {'white' | 'pink' | 'brown'} */ kind) => {
    const data = fillNoise(kind, rng, ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(/** @type {any} */ (data), 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  };
  const chain = (/** @type {AudioNode[]} */ nodes) => nodes.reduce((a, b) => (a.connect(b), b));

  // Tyre screech: band-passed white noise.
  const screechGain = ctx.createGain();
  screechGain.gain.value = 0;
  const screechSrc = loop('white');
  const screechFilter = ctx.createBiquadFilter();
  screechFilter.type = 'bandpass';
  screechFilter.frequency.value = 1900;
  screechFilter.Q.value = 5;
  chain([screechSrc, screechFilter, screechGain, master]);
  screechSrc.start();

  // The rain wash: pink noise, high-passed.
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0;
  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = 'highpass';
  rainFilter.frequency.value = 2600;
  const rainSrc = loop('pink');
  chain([rainSrc, rainFilter, rainGain, master]);
  rainSrc.start();

  let birdIn = 2;
  let cricketIn = 0.5;
  let volume = 1;
  let age = 0;
  /** One short pitched blip with a downward chirp. */
  const blip = (/** @type {number} */ f0, /** @type {number} */ f1, /** @type {number} */ dur, /** @type {number} */ gain, /** @type {OscillatorType} */ type = 'sine') => {
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain * volume, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  return {
    /**
     * Per frame. `slip` is 0..1 sideways sliding; `hour` and `rain` shape the ambience.
     * @param {number} dt
     * @param {{ slip: number, hour: number, rain: number }} s
     */
    update(dt, s) {
      age += dt;
      const t = ctx.currentTime;
      screechGain.gain.setTargetAtTime(Math.min(1, s.slip) * 0.09 * volume, t, 0.05);
      const mix = ambienceMix(s.hour, s.rain);
      rainGain.gain.setTargetAtTime(mix.rain * 0.05 * volume, t, 0.5);
      if (mix.birds > 0) {
        birdIn -= dt;
        if (birdIn <= 0) {
          birdIn = 2.5 + rng.next() * 6;
          const base = 2200 + rng.next() * 1600;
          blip(base, base * 1.35, 0.09, 0.03);
          if (rng.next() < 0.6) blip(base * 1.2, base * 0.9, 0.11, 0.025);
        }
      }
      if (mix.crickets > 0) {
        cricketIn -= dt;
        if (cricketIn <= 0) {
          cricketIn = 0.35 + rng.next() * 0.4;
          for (let i = 0; i < 3; i += 1) blip(4300, 4200, 0.03, 0.012, 'square');
        }
      }
      void age;
    },
    /** @param {number} v 0..1 */
    setVolume(v) {
      volume = v;
    },
    dispose() {
      for (const n of [screechSrc, rainSrc]) {
        try { n.stop(); } catch { /* already stopped */ }
      }
      master.disconnect();
    },
  };
}
