import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The engine-free half of the fidelity and juice kit, imported straight from
 * `templates/media-game/kit/core/`: procedural textures (noise, Sobel normals),
 * the juice settings reducer and reduced-motion scaling, sfx recipes, tweens and
 * the juice core (trauma, hit-stop, particles). The three.js and Phaser adapters
 * need WebGL and are covered by the screenshot run in the PR.
 */

const coreDir = resolve(__dirname, '../../../../../templates/media-game/kit/core');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(coreDir, file)).href);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kit/core/procedural-textures.js', () => {
  it('noise is deterministic per seed, bounded, and differs between seeds', async () => {
    const { hash2, valueNoise, fbm } = await load('procedural-textures.js');
    expect(hash2(5, 3, 9)).toBe(hash2(5, 3, 9));
    expect(hash2(5, 3, 9)).not.toBe(hash2(6, 3, 9));
    for (let i = 0; i < 200; i += 1) {
      const v = valueNoise(7, i * 0.37, i * 0.91);
      const f = fbm(7, i * 0.37, i * 0.91, { octaves: 5 });
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    expect(fbm(1, 2.5, 3.5)).toBe(fbm(1, 2.5, 3.5));
    expect(fbm(1, 2.5, 3.5)).not.toBe(fbm(2, 2.5, 3.5));
  });

  it('periodic noise tiles seamlessly', async () => {
    const { valueNoise, fbm } = await load('procedural-textures.js');
    expect(valueNoise(3, 0.4, 1.7, 4)).toBeCloseTo(valueNoise(3, 4.4, 1.7, 4), 12);
    expect(valueNoise(3, 0.4, 1.7, 4)).toBeCloseTo(valueNoise(3, 0.4, 5.7, 4), 12);
    expect(fbm(3, 0.4, 1.7, { period: 4, octaves: 3 })).toBeCloseTo(fbm(3, 4.4, 1.7, { period: 4, octaves: 3 }), 12);
  });

  it('a flat height field gives a straight-up normal (OpenGL: 128, 128, 255)', async () => {
    const { heightToNormal } = await load('procedural-textures.js');
    const flat = new Float32Array(16).fill(0.5);
    const n = heightToNormal(flat, 4, 4, 2);
    for (let i = 0; i < 16; i += 1) {
      expect([n[i * 4], n[i * 4 + 1], n[i * 4 + 2], n[i * 4 + 3]]).toEqual([128, 128, 255, 255]);
    }
  });

  it('a ramp rising to the right tilts the normal left; one rising downwards tilts it down (green falls)', async () => {
    const { heightToNormal } = await load('procedural-textures.js');
    const w = 8;
    const right = new Float32Array(w * w);
    const down = new Float32Array(w * w);
    for (let y = 0; y < w; y += 1) {
      for (let x = 0; x < w; x += 1) {
        right[y * w + x] = x / w;
        down[y * w + x] = y / w;
      }
    }
    const nr = heightToNormal(right, w, w, 2);
    const i = (3 * w + 3) * 4;
    expect(nr[i]).toBeLessThan(128); // x leans -X: the surface faces left of the slope
    expect(nr[i + 1]).toBe(128);
    const nd = heightToNormal(down, w, w, 2);
    expect(nd[i + 1]).toBeGreaterThan(128); // image y grows downward, normal +Y is up: rising downward faces up
    // Unit length: (2n-1) magnitudes sum to ~1.
    const x = (nr[i]! / 255) * 2 - 1;
    const y = (nr[i + 1]! / 255) * 2 - 1;
    const z = (nr[i + 2]! / 255) * 2 - 1;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1);
  });

  it('every kind generates identical bytes for a seed, different bytes for another, and consistent maps', async () => {
    const { generateTextureData, TEXTURE_KINDS } = await load('procedural-textures.js');
    for (const kind of TEXTURE_KINDS) {
      const a = generateTextureData(kind, { seed: 4, size: 32 });
      const b = generateTextureData(kind, { seed: 4, size: 32 });
      const c = generateTextureData(kind, { seed: 5, size: 32 });
      expect(Buffer.from(a.albedo).equals(Buffer.from(b.albedo)), kind).toBe(true);
      expect(Buffer.from(a.normal).equals(Buffer.from(b.normal)), kind).toBe(true);
      expect(Buffer.from(a.albedo).equals(Buffer.from(c.albedo)), kind).toBe(false);
      expect(a.albedo.length).toBe(32 * 32 * 4);
      expect(a.normal.length).toBe(32 * 32 * 4);
      expect(a.roughness.length).toBe(32 * 32 * 4);
      // The bump map is the height field as grey.
      expect(a.bump[0]).toBe(Math.round(a.height[0] * 255));
    }
    expect(() => generateTextureData('lava')).toThrow(/unknown texture kind/);
  });
});

describe('kit/core/juice-settings.js', () => {
  it('defaults to juice on, and normalizes bad input', async () => {
    const { DEFAULT_JUICE_SETTINGS, normalizeSettings } = await load('juice-settings.js');
    expect(DEFAULT_JUICE_SETTINGS).toMatchObject({ enabled: true, intensity: 1, shake: true, flash: true, postfx: true, reducedMotion: 'auto' });
    expect(normalizeSettings({ intensity: 99, volume: -4, shake: 'yes', reducedMotion: 'maybe' })).toMatchObject({ intensity: 2, volume: 0, shake: true, reducedMotion: 'auto' });
    expect(normalizeSettings(null)).toEqual({ ...DEFAULT_JUICE_SETTINGS });
  });

  it('the reducer patches, switches off and on, and resets', async () => {
    const { DEFAULT_JUICE_SETTINGS, juiceReducer } = await load('juice-settings.js');
    let s = { ...DEFAULT_JUICE_SETTINGS };
    s = juiceReducer(s, { type: 'patch', patch: { intensity: 0.5, shake: false } });
    expect(s).toMatchObject({ intensity: 0.5, shake: false, flash: true });
    s = juiceReducer(s, { type: 'off' });
    expect(s.enabled).toBe(false);
    expect(s.intensity).toBe(0.5);
    s = juiceReducer(s, { type: 'on' });
    expect(s.enabled).toBe(true);
    expect(juiceReducer(s, { type: 'reset' })).toEqual({ ...DEFAULT_JUICE_SETTINGS });
  });

  it('resolves intensity into scales, and reduced motion scales shake and flashes down and drops postfx', async () => {
    const { DEFAULT_JUICE_SETTINGS, REDUCED_MOTION_SCALE, resolveJuice } = await load('juice-settings.js');
    const normal = resolveJuice({ ...DEFAULT_JUICE_SETTINGS, intensity: 0.8 }, { reducedMotion: false });
    expect(normal).toMatchObject({ shake: 0.8, flash: 0.8, particles: 0.8, postfx: true, reducedMotion: false });
    const reduced = resolveJuice({ ...DEFAULT_JUICE_SETTINGS, intensity: 0.8 }, { reducedMotion: true });
    expect(reduced.shake).toBeCloseTo(0.8 * REDUCED_MOTION_SCALE.shake, 10);
    expect(reduced.flash).toBeCloseTo(0.8 * REDUCED_MOTION_SCALE.flash, 10);
    expect(reduced.postfx).toBe(false);
    // An explicit override beats the media query either way.
    expect(resolveJuice({ ...DEFAULT_JUICE_SETTINGS, reducedMotion: 'off' }, { reducedMotion: true }).shake).toBe(1);
    expect(resolveJuice({ ...DEFAULT_JUICE_SETTINGS, reducedMotion: 'on' }, { reducedMotion: false }).reducedMotion).toBe(true);
    // Per-family toggles and the master switch.
    expect(resolveJuice({ ...DEFAULT_JUICE_SETTINGS, shake: false }).shake).toBe(0);
    expect(resolveJuice({ ...DEFAULT_JUICE_SETTINGS, postfx: false }, { reducedMotion: false }).postfx).toBe(false);
    expect(resolveJuice({ ...DEFAULT_JUICE_SETTINGS, enabled: false })).toMatchObject({ shake: 0, flash: 0, particles: 0, postfx: false, volume: 0 });
  });

  it('detects reduced motion from the media query, and is false without one', async () => {
    const { detectReducedMotion } = await load('juice-settings.js');
    expect(detectReducedMotion()).toBe(false);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    expect(detectReducedMotion()).toBe(true);
  });

  it('the store persists through the save slot, honours ?juice=off, and exposes itself on the hook', async () => {
    const { createJuiceSettings } = await load('juice-settings.js');
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
    };
    const a = createJuiceSettings({ gameName: 'g', storage, search: '', expose: false });
    a.set({ intensity: 0.4, flash: false });
    expect(JSON.parse(data.get('midnite:g:juice-settings') as string)).toMatchObject({ intensity: 0.4, flash: false });
    const b = createJuiceSettings({ gameName: 'g', storage, search: '', expose: false });
    expect(b.get()).toMatchObject({ intensity: 0.4, flash: false });
    const seen: number[] = [];
    b.subscribe((s: { intensity: number }) => seen.push(s.intensity));
    b.set({ intensity: 1.2 });
    expect(seen).toEqual([1.2]);
    // off() is a per-run switch: it is not saved.
    b.off();
    expect(b.resolved().shake).toBe(0);
    expect(JSON.parse(data.get('midnite:g:juice-settings') as string).enabled).toBe(true);
    expect(createJuiceSettings({ gameName: 'g', storage, search: '?x=1&juice=off', expose: false }).get().enabled).toBe(false);

    const win: Record<string, unknown> = {};
    vi.stubGlobal('window', win);
    const { installHook } = await load('hook.js');
    createJuiceSettings({ search: '' });
    const hook = installHook() as { juice: { get(): unknown; off(): unknown } };
    expect(typeof hook.juice.get).toBe('function');
    hook.juice.off();
    expect((win['__midnite'] as typeof hook).juice.get()).toMatchObject({ enabled: false });
  });
});

describe('kit/core/sfx.js', () => {
  it('builds every named preset, with sane layers', async () => {
    const { SFX_NAMES, buildRecipe } = await load('sfx.js');
    for (const name of ['jump', 'land', 'footstep', 'shoot', 'laser', 'hit', 'hurt', 'explosion', 'pickup', 'coin', 'powerup', 'ui-click', 'ui-hover', 'door', 'swing', 'block', 'parry', 'death', 'win']) {
      expect(SFX_NAMES).toContain(name);
    }
    for (const name of SFX_NAMES as string[]) {
      const r = buildRecipe(name, { seed: 1 });
      expect(r.name).toBe(name);
      expect(r.layers.length).toBeGreaterThan(0);
      expect(r.duration).toBeGreaterThan(0);
      expect(r.duration).toBeLessThan(2);
      for (const l of r.layers) {
        expect(l.gain).toBeGreaterThan(0);
        expect(l.gain).toBeLessThanOrEqual(1);
        expect(l.dur).toBeGreaterThan(0);
        expect(l.at).toBeGreaterThanOrEqual(0);
        if (l.kind === 'osc') expect(l.f[0]).toBeGreaterThan(0);
      }
    }
    expect(() => buildRecipe('nope')).toThrow(/unknown sfx preset/);
  });

  it('is seeded: same seed same recipe, another seed another recipe, variation 0 is exact', async () => {
    const { buildRecipe } = await load('sfx.js');
    expect(buildRecipe('hit', { seed: 9 })).toEqual(buildRecipe('hit', { seed: 9 }));
    expect(buildRecipe('hit', { seed: 9 })).not.toEqual(buildRecipe('hit', { seed: 10 }));
    expect(buildRecipe('hit', { seed: 9, variation: 0 })).toEqual(buildRecipe('hit', { seed: 10, variation: 0 }));
  });

  it('pitch and power scale frequency and loudness', async () => {
    const { buildRecipe } = await load('sfx.js');
    const base = buildRecipe('jump', { seed: 2, variation: 0 });
    const high = buildRecipe('jump', { seed: 2, variation: 0, pitch: 2, power: 0.5 });
    expect(high.layers[0].f[0]).toBeCloseTo(base.layers[0].f[0] * 2, 9);
    expect(high.layers[0].gain).toBeCloseTo(base.layers[0].gain * 0.5, 9);
  });

  it('noise is deterministic and bounded; brown is smoother than white', async () => {
    const { fillNoise } = await load('sfx.js');
    const { createRng } = await load('rng.js');
    const a = fillNoise('white', createRng(3), 512);
    expect(Array.from(a)).toEqual(Array.from(fillNoise('white', createRng(3), 512)));
    const roughness = (x: Float32Array) => x.reduce((s, v, i) => (i ? s + Math.abs(v - (x[i - 1] as number)) : s), 0);
    for (const kind of ['white', 'pink', 'brown'] as const) {
      const n = fillNoise(kind, createRng(3), 2048);
      expect(Math.max(...Array.from(n).map(Math.abs))).toBeLessThan(2);
    }
    expect(roughness(fillNoise('brown', createRng(3), 2048))).toBeLessThan(roughness(fillNoise('white', createRng(3), 2048)));
  });

  it('pans by side and attenuates by distance', async () => {
    const { panFromPosition } = await load('sfx.js');
    const listener = { position: [0, 0, 0], right: [1, 0, 0] };
    expect(panFromPosition(listener, [5, 0, 0]).pan).toBeGreaterThan(0.5);
    expect(panFromPosition(listener, [-5, 0, 0]).pan).toBeLessThan(-0.5);
    expect(panFromPosition(listener, [0, 0, -5]).pan).toBeCloseTo(0, 9);
    expect(panFromPosition(listener, [1, 0, 0]).gain).toBeGreaterThan(panFromPosition(listener, [20, 0, 0]).gain);
    expect(panFromPosition(listener, [99, 0, 0]).gain).toBe(0);
  });

  it('createSfx is a harmless no-op without an AudioContext, and still counts plays', async () => {
    const { createSfx } = await load('sfx.js');
    const sfx = createSfx({ autoUnlock: false });
    expect(sfx.play('jump')).toBeNull();
    expect(sfx.played).toBe(1);
    expect(sfx.voices).toBe(0);
  });
});

describe('kit/core/tween.js', () => {
  it('easings hit their end points', async () => {
    const { EASE } = await load('tween.js');
    for (const [name, fn] of Object.entries(EASE) as [string, (t: number) => number][]) {
      expect(fn(0), name).toBeCloseTo(0, 6);
      expect(fn(1), name).toBeCloseTo(1, 6);
    }
    expect(EASE.outBack(0.8)).toBeGreaterThan(1);
  });

  it('tweens run on the given dt, honour delay, and complete once', async () => {
    const { createTweens } = await load('tween.js');
    const tweens = createTweens();
    const values: number[] = [];
    let done = 0;
    tweens.tween({ from: 10, to: 20, duration: 1, delay: 0.5, onUpdate: (v: number) => values.push(v), onComplete: () => (done += 1) });
    tweens.update(0.25);
    expect(values).toEqual([]);
    tweens.update(0.5); // age 0.25 into the tween
    expect(values[0]).toBeCloseTo(12.5, 9);
    tweens.update(2);
    expect(values.at(-1)).toBe(20);
    expect(done).toBe(1);
    expect(tweens.count).toBe(0);
    const h = tweens.tween({ duration: 1, onComplete: () => (done += 1) });
    h.cancel();
    tweens.update(2);
    expect(done).toBe(1);
  });
});

describe('kit/core/juice-core.js', () => {
  it('trauma decays and the shake is its square', async () => {
    const { createTrauma } = await load('juice-core.js');
    const t = createTrauma({ decay: 1 });
    expect(t.sample().amount).toBe(0);
    t.add(0.5);
    t.add(2);
    expect(t.trauma).toBe(1);
    expect(t.sample().amount).toBe(1);
    t.update(0.5);
    expect(t.trauma).toBeCloseTo(0.5, 9);
    expect(t.sample().amount).toBeCloseTo(0.25, 9);
    for (const v of [t.sample().x, t.sample().y, t.sample().roll]) expect(Math.abs(v)).toBeLessThanOrEqual(0.25);
    t.update(5);
    expect(t.trauma).toBe(0);
  });

  it('shake is a pure function of its own clock: two replays match', async () => {
    const { createTrauma } = await load('juice-core.js');
    const run = () => {
      const t = createTrauma();
      t.add(0.8);
      const out: number[] = [];
      for (let i = 0; i < 20; i += 1) {
        t.update(1 / 60);
        out.push(t.sample().x);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('hit-stop freezes the sim for its duration and then resumes; slow motion scales dt', async () => {
    const { createTimeScale } = await load('juice-core.js');
    const ts = createTimeScale();
    expect(ts.scale(1 / 60)).toBeCloseTo(1 / 60, 9);
    ts.hitStop(50);
    expect(ts.frozen).toBe(true);
    expect(ts.scale(1 / 60)).toBe(0);
    expect(ts.scale(1 / 60)).toBe(0);
    expect(ts.scale(1 / 60)).toBe(0);
    expect(ts.frozen).toBe(false);
    expect(ts.scale(1 / 60)).toBeCloseTo(1 / 60, 9);
    ts.slowMo(0.25, 0.1);
    expect(ts.scale(0.04)).toBeCloseTo(0.01, 9);
  });

  it('particle bursts are seeded, scale with intensity, and vanish at zero', async () => {
    const { spawnParticles, PARTICLE_PRESETS } = await load('juice-core.js');
    const { createRng } = await load('rng.js');
    const a = spawnParticles('spark', createRng(7), { dir: [0, 1, 0] });
    expect(a).toEqual(spawnParticles('spark', createRng(7), { dir: [0, 1, 0] }));
    expect(a.length).toBeGreaterThanOrEqual(PARTICLE_PRESETS.spark.count[0]);
    for (const p of a) {
      expect(p.life).toBeGreaterThan(0);
      expect(PARTICLE_PRESETS.spark.colors).toContain(p.color);
    }
    expect(spawnParticles('dust', createRng(7), { scale: 0 })).toEqual([]);
    expect(spawnParticles('debris', createRng(7), { count: 20, scale: 1 }).length).toBe(20);
    expect(spawnParticles('debris', createRng(7), { count: 20, scale: 0.5 }).length).toBe(10);
    expect(() => spawnParticles('lava', createRng(1))).toThrow(/unknown particle preset/);
  });

  it('every trigger names a real sfx preset and particle preset', async () => {
    const { TRIGGERS, PARTICLE_PRESETS } = await load('juice-core.js');
    const { SFX_NAMES } = await load('sfx.js');
    for (const [name, t] of Object.entries(TRIGGERS) as [string, { sfx?: string; particles?: string }][]) {
      if (t.sfx) expect(SFX_NAMES, name).toContain(t.sfx);
      if (t.particles) expect(Object.keys(PARTICLE_PRESETS), name).toContain(t.particles);
    }
  });
});
