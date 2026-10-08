// @ts-check
/**
 * Open world sound beds, synthesized on the sfx player's AudioContext: a car engine whose pitch follows
 * speed, a tyre screech for slides, and an ambient pad (wind, birds by day, crickets by night). They are
 * continuous, so they do not fit the one-shot presets in `kit/core/sfx.js`; they live here, with the genre.
 * Without an AudioContext, or before the first key press unlocks it, every call is a harmless no-op.
 */

import { fillNoise } from 'kit/core/sfx.js';

import { ambienceMix, engineParams } from './sound-math.js';

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

  // Engine: two detuned saws through a low-pass.
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.Q.value = 3;
  const oscA = ctx.createOscillator();
  const oscB = ctx.createOscillator();
  oscA.type = 'sawtooth';
  oscB.type = 'square';
  oscA.connect(engineFilter);
  oscB.connect(engineFilter);
  chain([engineFilter, engineGain, master]);
  oscA.start();
  oscB.start();

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

  // Wind and rain beds: brown noise low-passed, and pink noise high-passed.
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 420;
  const windSrc = loop('brown');
  chain([windSrc, windFilter, windGain, master]);
  windSrc.start();
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
     * Per frame. `car` is null on foot; `slip` is 0..1 sideways sliding; `hour` and `rain` shape the ambience.
     * @param {number} dt
     * @param {{ car: { speed: number, throttle: number } | null, slip: number, hour: number, rain: number }} s
     */
    update(dt, s) {
      age += dt;
      const t = ctx.currentTime;
      const e = s.car ? engineParams(s.car.speed, s.car.throttle) : { frequency: 40, gain: 0, cutoff: 200 };
      oscA.frequency.setTargetAtTime(e.frequency, t, 0.08);
      oscB.frequency.setTargetAtTime(e.frequency * 0.5, t, 0.08);
      engineFilter.frequency.setTargetAtTime(e.cutoff, t, 0.1);
      engineGain.gain.setTargetAtTime(e.gain * volume, t, 0.1);
      screechGain.gain.setTargetAtTime(Math.min(1, s.slip) * 0.09 * volume, t, 0.05);
      const mix = ambienceMix(s.hour, s.rain);
      windGain.gain.setTargetAtTime(mix.wind * 0.07 * volume, t, 0.5);
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
      for (const n of [oscA, oscB, screechSrc, windSrc, rainSrc]) {
        try { n.stop(); } catch { /* already stopped */ }
      }
      master.disconnect();
    },
  };
}
