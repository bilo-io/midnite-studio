// @ts-check
/**
 * Midnite game kit — synthesized sound effects (engine-free WebAudio).
 *
 * No audio files: each effect is a short recipe of oscillator and noise layers
 * with envelopes and filters. `buildRecipe(name, ...)` is pure and seeded (the
 * same seed gives the same recipe, with a little per-play variation drawn from
 * the sfx's OWN rng stream so sound never disturbs gameplay randomness);
 * `createSfx(...)` plays recipes through a master bus with voice limiting and
 * unlock-on-first-gesture. `kit/three/audio.js` and `kit/phaser/audio.js` expose
 * one as `audio.sfx`. Where there is no AudioContext (node, a play-test with
 * audio blocked) every call is a harmless no-op.
 */

import { createRng } from './rng.js';

/**
 * @typedef {{
 *   kind: 'osc' | 'noise', wave?: OscillatorType, noise?: 'white' | 'pink' | 'brown',
 *   f: [number, number], at: number, dur: number, gain: number, attack?: number,
 *   filter?: { type: BiquadFilterType, f: [number, number], q?: number },
 *   vibrato?: { rate: number, depth: number },
 * }} Layer
 * @typedef {{ name: string, duration: number, layers: Layer[] }} Recipe
 */

/** Every preset name `buildRecipe` accepts. */
export const SFX_NAMES = /** @type {const} */ ([
  'jump', 'land', 'footstep', 'shoot', 'laser', 'hit', 'hurt', 'explosion', 'pickup', 'coin', 'powerup',
  'ui-click', 'ui-hover', 'door', 'swing', 'block', 'parry', 'death', 'win',
]);

/** Equal-tempered semitone ratio. @param {number} n */
const semi = (n) => 2 ** (n / 12);

/**
 * @typedef {{ v: (base: number, pct?: number) => number, pitch: number, power: number }} Ctx
 * Per-play context: `v` varies a number by up to ±pct, `pitch` and `power` are the caller's multipliers.
 * @type {Record<string, (c: Ctx) => Layer[]>}
 */
const PRESETS = {
  jump: ({ v, pitch, power }) => [
    { kind: 'osc', wave: 'square', f: [v(260 * pitch, 0.05), v(620 * pitch, 0.05)], at: 0, dur: 0.17, gain: 0.16 * power, filter: { type: 'lowpass', f: [3000, 1200] } },
    { kind: 'osc', wave: 'sine', f: [v(520 * pitch, 0.04), v(1100 * pitch, 0.04)], at: 0, dur: 0.14, gain: 0.12 * power },
  ],
  land: ({ v, pitch, power }) => [
    { kind: 'noise', noise: 'brown', f: [0, 0], at: 0, dur: 0.15, gain: 0.55 * power, filter: { type: 'lowpass', f: [v(700, 0.15), 160] } },
    { kind: 'osc', wave: 'sine', f: [v(110 * pitch, 0.05), 45], at: 0, dur: 0.14, gain: 0.45 * power },
  ],
  footstep: ({ v, pitch, power }) => [
    { kind: 'noise', noise: 'brown', f: [0, 0], at: 0, dur: 0.07, gain: 0.3 * power, filter: { type: 'lowpass', f: [v(1000 * pitch, 0.25), 300] } },
    { kind: 'osc', wave: 'sine', f: [v(90 * pitch, 0.12), 55], at: 0, dur: 0.06, gain: 0.18 * power },
  ],
  shoot: ({ v, pitch, power }) => [
    { kind: 'noise', noise: 'white', f: [0, 0], at: 0, dur: 0.13, gain: 0.5 * power, filter: { type: 'highpass', f: [v(1400, 0.1), 300] } },
    { kind: 'osc', wave: 'sawtooth', f: [v(240 * pitch, 0.06), 55], at: 0, dur: 0.11, gain: 0.32 * power, filter: { type: 'lowpass', f: [2400, 400] } },
  ],
  laser: ({ v, pitch, power }) => [
    { kind: 'osc', wave: 'sawtooth', f: [v(1900 * pitch, 0.05), v(180 * pitch, 0.05)], at: 0, dur: 0.2, gain: 0.22 * power, filter: { type: 'lowpass', f: [5000, 800] } },
    { kind: 'osc', wave: 'square', f: [v(950 * pitch, 0.05), 90], at: 0, dur: 0.16, gain: 0.12 * power },
  ],
  hit: ({ v, pitch, power }) => [
    { kind: 'noise', noise: 'white', f: [0, 0], at: 0, dur: 0.09, gain: 0.55 * power, filter: { type: 'bandpass', f: [v(1600, 0.15), 600], q: 1.2 } },
    { kind: 'osc', wave: 'sine', f: [v(220 * pitch, 0.06), 55], at: 0, dur: 0.11, gain: 0.5 * power },
  ],
  hurt: ({ v, pitch, power }) => [
    { kind: 'osc', wave: 'sawtooth', f: [v(340 * pitch, 0.05), v(110 * pitch, 0.05)], at: 0, dur: 0.26, gain: 0.3 * power, filter: { type: 'lowpass', f: [1500, 300] }, vibrato: { rate: 24, depth: 14 } },
    { kind: 'noise', noise: 'white', f: [0, 0], at: 0, dur: 0.1, gain: 0.3 * power, filter: { type: 'bandpass', f: [900, 500], q: 0.8 } },
  ],
  explosion: ({ v, pitch, power }) => [
    { kind: 'noise', noise: 'brown', f: [0, 0], at: 0, dur: v(0.95, 0.1), gain: 0.95 * power, attack: 0.005, filter: { type: 'lowpass', f: [v(1900, 0.1), 70] } },
    { kind: 'osc', wave: 'sine', f: [v(75 * pitch, 0.06), 26], at: 0, dur: 0.75, gain: 0.85 * power },
    { kind: 'noise', noise: 'white', f: [0, 0], at: 0, dur: 0.16, gain: 0.4 * power, filter: { type: 'highpass', f: [2500, 800] } },
  ],
  pickup: ({ v, pitch, power }) => [
    { kind: 'osc', wave: 'sine', f: [v(660 * pitch, 0.03), v(880 * pitch, 0.03)], at: 0, dur: 0.09, gain: 0.25 * power },
    { kind: 'osc', wave: 'sine', f: [v(990 * pitch, 0.03), v(1320 * pitch, 0.03)], at: 0.07, dur: 0.16, gain: 0.25 * power },
  ],
  coin: ({ v, pitch, power }) => [
    { kind: 'osc', wave: 'square', f: [988 * pitch, 988 * pitch], at: 0, dur: 0.07, gain: 0.14 * power },
    { kind: 'osc', wave: 'square', f: [v(1319 * pitch, 0.01), v(1319 * pitch, 0.01)], at: 0.065, dur: 0.3, gain: 0.14 * power },
  ],
  powerup: ({ pitch, power }) =>
    [0, 4, 7, 12, 16].map((n, i) => /** @type {Layer} */ ({ kind: 'osc', wave: 'triangle', f: [440 * pitch * semi(n), 440 * pitch * semi(n)], at: i * 0.07, dur: 0.18, gain: 0.22 * power })),
  'ui-click': ({ v, pitch, power }) => [
    { kind: 'osc', wave: 'square', f: [v(1300 * pitch, 0.03), v(800 * pitch, 0.03)], at: 0, dur: 0.035, gain: 0.12 * power },
  ],
  'ui-hover': ({ v, pitch, power }) => [
    { kind: 'osc', wave: 'sine', f: [v(900 * pitch, 0.03), v(1150 * pitch, 0.03)], at: 0, dur: 0.05, gain: 0.07 * power },
  ],
  door: ({ v, pitch, power }) => [
    { kind: 'osc', wave: 'sawtooth', f: [v(90 * pitch, 0.08), 60 * pitch], at: 0, dur: 0.5, gain: 0.22 * power, filter: { type: 'lowpass', f: [380, 160] }, vibrato: { rate: 9, depth: 6 } },
    { kind: 'noise', noise: 'pink', f: [0, 0], at: 0, dur: 0.45, gain: 0.12 * power, filter: { type: 'bandpass', f: [v(420, 0.2), 760], q: 4 } },
    { kind: 'noise', noise: 'brown', f: [0, 0], at: 0.46, dur: 0.12, gain: 0.5 * power, filter: { type: 'lowpass', f: [500, 120] } },
  ],
  swing: ({ v, pitch, power }) => [
    { kind: 'noise', noise: 'white', f: [0, 0], at: 0, dur: 0.26, gain: 0.34 * power, attack: 0.09, filter: { type: 'bandpass', f: [v(500 * pitch, 0.1), v(2600 * pitch, 0.1)], q: 1.4 } },
  ],
  block: ({ v, pitch, power }) => [
    { kind: 'noise', noise: 'white', f: [0, 0], at: 0, dur: 0.05, gain: 0.5 * power, filter: { type: 'highpass', f: [2000, 1500] } },
    { kind: 'osc', wave: 'triangle', f: [v(1800 * pitch, 0.04), 1750 * pitch], at: 0, dur: 0.14, gain: 0.3 * power },
    { kind: 'osc', wave: 'sine', f: [v(240 * pitch, 0.05), 120], at: 0, dur: 0.12, gain: 0.35 * power },
  ],
  parry: ({ v, pitch, power }) => [
    { kind: 'osc', wave: 'sine', f: [v(2400 * pitch, 0.03), v(3200 * pitch, 0.03)], at: 0, dur: 0.32, gain: 0.22 * power },
    { kind: 'osc', wave: 'triangle', f: [1200 * pitch, 1180 * pitch], at: 0, dur: 0.18, gain: 0.2 * power },
    { kind: 'noise', noise: 'white', f: [0, 0], at: 0, dur: 0.04, gain: 0.4 * power, filter: { type: 'highpass', f: [3500, 3000] } },
  ],
  death: ({ v, pitch, power }) => [
    { kind: 'osc', wave: 'sawtooth', f: [v(420 * pitch, 0.04), 38], at: 0, dur: 0.95, gain: 0.3 * power, filter: { type: 'lowpass', f: [1400, 90] } },
    { kind: 'noise', noise: 'brown', f: [0, 0], at: 0.05, dur: 0.6, gain: 0.3 * power, filter: { type: 'lowpass', f: [900, 100] } },
  ],
  win: ({ pitch, power }) =>
    [0, 4, 7, 12, 16, 19].map((n, i) => /** @type {Layer} */ ({ kind: 'osc', wave: 'triangle', f: [523 * pitch * semi(n), 523 * pitch * semi(n)], at: i * 0.1, dur: i === 5 ? 0.7 : 0.3, gain: 0.2 * power })),
};

/**
 * Build the recipe for a preset. Pure: draws only from `rng`.
 * @param {string} name one of `SFX_NAMES`
 * @param {{ rng?: { next(): number }, seed?: number, pitch?: number, power?: number, variation?: number }} [o]
 *   `pitch` and `power` multiply frequency and loudness; `variation` scales the random per-play detune (0 = identical every time)
 * @returns {Recipe}
 */
export function buildRecipe(name, o = {}) {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`unknown sfx preset: ${name}`);
  const rng = o.rng ?? createRng(o.seed ?? 1);
  const variation = o.variation ?? 1;
  const v = (/** @type {number} */ base, /** @type {number} */ pct = 0.05) => base * (1 + (rng.next() * 2 - 1) * pct * variation);
  const layers = preset({ v, pitch: o.pitch ?? 1, power: o.power ?? 1 });
  return { name, duration: Math.max(...layers.map((l) => l.at + l.dur)), layers };
}

/**
 * Noise samples. white = uniform; pink = Paul Kellet's filter; brown = leaky integrated white.
 * @param {'white' | 'pink' | 'brown'} kind
 * @param {{ next(): number }} rng
 * @param {number} length
 * @returns {Float32Array}
 */
export function fillNoise(kind, rng, length) {
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < length; i += 1) {
    const white = rng.next() * 2 - 1;
    if (kind === 'white') out[i] = white;
    else if (kind === 'pink') {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      out[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    } else {
      last = (last + 0.02 * white) / 1.02;
      out[i] = last * 3.5;
    }
  }
  return out;
}

/**
 * Stereo pan and distance gain for a sound at `position` heard from `listener`
 * (a world position and its right vector). Pan is the sound's offset along `right`
 * over its distance; gain falls off past `refDistance` (inverse distance, floored at 0).
 * @param {{ position: readonly number[], right: readonly number[] }} listener
 * @param {readonly number[]} position
 * @param {{ maxDistance?: number, refDistance?: number }} [o]
 * @returns {{ pan: number, gain: number }}
 */
export function panFromPosition(listener, position, o = {}) {
  const maxDistance = o.maxDistance ?? 40;
  const refDistance = o.refDistance ?? 4;
  const dx = (position[0] ?? 0) - (listener.position[0] ?? 0);
  const dy = (position[1] ?? 0) - (listener.position[1] ?? 0);
  const dz = (position[2] ?? 0) - (listener.position[2] ?? 0);
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return { pan: 0, gain: 1 };
  const side = (dx * (listener.right[0] ?? 0) + dy * (listener.right[1] ?? 0) + dz * (listener.right[2] ?? 0)) / dist;
  const gain = dist >= maxDistance ? 0 : Math.min(1, refDistance / Math.max(refDistance, dist)) * (1 - dist / maxDistance);
  return { pan: Math.max(-1, Math.min(1, side * 0.9)), gain };
}

/**
 * Create a sound-effect player.
 * @param {{
 *   context?: AudioContext | null,
 *   destination?: AudioNode | null,
 *   seed?: number,
 *   maxVoices?: number,
 *   cooldown?: number,
 *   volume?: number,
 *   autoUnlock?: boolean,
 *   listener?: () => { position: readonly number[], right: readonly number[] } | null,
 * }} [options]
 *   `context` reuses an existing AudioContext (three's listener context, Phaser's sound context); `cooldown` is the minimum seconds between two plays of the same preset;
 *   `listener` supplies the camera pose for positional plays.
 */
export function createSfx(options = {}) {
  const rng = createRng(options.seed ?? 0x5fc);
  const maxVoices = options.maxVoices ?? 24;
  const cooldown = options.cooldown ?? 0.03;
  let volume = options.volume ?? 1;
  let muted = false;
  /** @type {AudioContext | null} */
  let ctx = options.context ?? null;
  /** @type {GainNode | null} */
  let master = null;
  /** @type {Partial<Record<'white' | 'pink' | 'brown', AudioBuffer>>} */
  const noises = {};
  /** @type {{ end: number, gain: GainNode, stop: () => void }[]} */
  let voices = [];
  /** @type {Map<string, number>} */
  const lastPlayed = new Map();
  let played = 0;

  const ensure = () => {
    if (ctx && master) return true;
    try {
      const Ctor = globalThis.AudioContext ?? /** @type {any} */ (globalThis).webkitAudioContext;
      if (!ctx && !Ctor) return false;
      ctx ??= new Ctor();
      master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(options.destination ?? ctx.destination);
      master.gain.value = muted ? 0 : volume;
      return true;
    } catch {
      return false;
    }
  };
  const noiseBuffer = (/** @type {'white' | 'pink' | 'brown'} */ kind) => {
    const c = /** @type {AudioContext} */ (ctx);
    let b = noises[kind];
    if (!b) {
      const data = fillNoise(kind, rng, c.sampleRate);
      b = c.createBuffer(1, data.length, c.sampleRate);
      b.copyToChannel(/** @type {any} */ (data), 0);
      noises[kind] = b;
    }
    return b;
  };
  const unlock = () => {
    if (!ensure()) return;
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
  };
  if (options.autoUnlock !== false && typeof window !== 'undefined') {
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  const api = {
    /** Resume the AudioContext; call from a user gesture (done automatically on the first click or key). */
    unlock,
    get context() {
      return ctx;
    },
    get voices() {
      return voices.length;
    },
    /** Sounds started so far (for `getState`). */
    get played() {
      return played;
    },
    get muted() {
      return muted;
    },
    /** @param {number} v 0..1 */
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      if (master) master.gain.value = muted ? 0 : volume;
    },
    /** @param {boolean} on */
    setMuted(on) {
      muted = on;
      if (master) master.gain.value = on ? 0 : volume;
    },
    /**
     * Play a preset. `position` pans and attenuates by the `listener` pose; `pan` (-1..1) sets it directly.
     * @param {string} name
     * @param {{ volume?: number, pitch?: number, power?: number, pan?: number, position?: readonly number[], variation?: number, seed?: number }} [opts]
     * @returns {{ stop: () => void } | null}
     */
    play(name, opts = {}) {
      // Always build the recipe, so the sfx rng stream advances the same whether or not audio is running.
      const recipe = buildRecipe(name, { rng, pitch: opts.pitch, power: opts.power, variation: opts.variation, ...(opts.seed === undefined ? {} : { seed: opts.seed, rng: createRng(opts.seed) }) });
      played += 1;
      if (muted || volume <= 0 || !ensure() || !ctx || !master || ctx.state !== 'running') return null;
      const now = ctx.currentTime;
      const last = lastPlayed.get(name);
      if (last !== undefined && now - last < cooldown) return null;
      lastPlayed.set(name, now);
      voices = voices.filter((vo) => vo.end > now);
      while (voices.length >= maxVoices) {
        const oldest = /** @type {NonNullable<typeof voices[number]>} */ (voices.shift());
        oldest.gain.gain.cancelScheduledValues(now);
        oldest.gain.gain.setTargetAtTime(0, now, 0.01);
        oldest.stop();
      }
      let pan = opts.pan ?? 0;
      let gain = opts.volume ?? 1;
      const pose = opts.position ? options.listener?.() : null;
      if (opts.position && pose) {
        const p = panFromPosition(pose, opts.position);
        pan = p.pan;
        gain *= p.gain;
        if (gain <= 0.001) return null;
      }
      const voice = ctx.createGain();
      voice.gain.value = gain;
      /** @type {AudioNode} */
      let out = voice;
      if (pan !== 0 && ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        voice.connect(panner);
        out = panner;
      }
      out.connect(master);
      /** @type {(AudioScheduledSourceNode)[]} */
      const sources = [];
      for (const l of recipe.layers) {
        const t0 = now + l.at;
        const t1 = t0 + l.dur;
        const env = ctx.createGain();
        const attack = Math.min(l.attack ?? 0.004, l.dur * 0.5);
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.linearRampToValueAtTime(Math.max(0.0001, l.gain), t0 + attack);
        env.gain.exponentialRampToValueAtTime(0.0001, t1);
        /** @type {AudioNode} */
        let node = env;
        if (l.filter) {
          const f = ctx.createBiquadFilter();
          f.type = l.filter.type;
          f.Q.value = l.filter.q ?? 0.7;
          f.frequency.setValueAtTime(Math.max(20, l.filter.f[0]), t0);
          f.frequency.exponentialRampToValueAtTime(Math.max(20, l.filter.f[1]), t1);
          f.connect(env);
          node = f;
        }
        env.connect(voice);
        if (l.kind === 'osc') {
          const osc = ctx.createOscillator();
          osc.type = l.wave ?? 'sine';
          osc.frequency.setValueAtTime(Math.max(10, l.f[0]), t0);
          osc.frequency.exponentialRampToValueAtTime(Math.max(10, l.f[1]), t1);
          if (l.vibrato) {
            const lfo = ctx.createOscillator();
            const depth = ctx.createGain();
            lfo.frequency.value = l.vibrato.rate;
            depth.gain.value = l.vibrato.depth;
            lfo.connect(depth);
            depth.connect(osc.frequency);
            lfo.start(t0);
            lfo.stop(t1 + 0.05);
            sources.push(lfo);
          }
          osc.connect(node);
          osc.start(t0);
          osc.stop(t1 + 0.05);
          sources.push(osc);
        } else {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuffer(l.noise ?? 'white');
          src.loop = true;
          src.connect(node);
          src.start(t0);
          src.stop(t1 + 0.05);
          sources.push(src);
        }
      }
      const entry = {
        end: now + recipe.duration + 0.06,
        gain: voice,
        stop: () => {
          for (const s of sources) {
            try { s.stop(); } catch { /* already stopped */ }
          }
        },
      };
      voices.push(entry);
      return { stop: entry.stop };
    },
    dispose() {
      for (const vo of voices) vo.stop();
      voices = [];
      if (ctx && !options.context) void ctx.close().catch(() => {});
      ctx = null;
      master = null;
    },
  };
  return api;
}
