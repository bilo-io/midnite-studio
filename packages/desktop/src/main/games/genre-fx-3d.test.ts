import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The game-feel tables and pure helpers of the four 3D action genres (shooter, fighter,
 * soulslike, character action). Each genre keeps its own `src/genre/moments.js` (data and maths,
 * no imports), so the file is imported straight from the template and every row is checked
 * against the kit's sound and particle presets: a typo in a cue would otherwise only show up
 * as a thrown error mid-fight. The three.js side needs WebGL and is covered by booting each starter.
 */

const root = resolve(__dirname, '../../../../../templates/media-game');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS modules
const load = async (file: string): Promise<any> => import(pathToFileURL(join(root, file)).href);
const GENRES = ['shooter', 'fighter', 'soulslike', 'character-action'] as const;

/** The moments each genre must define: the juice the genre is meant to have. */
const REQUIRED: Record<(typeof GENRES)[number], string[]> = {
  shooter: ['fire-rifle', 'fire-pistol', 'fire-launcher', 'impact-wall', 'impact-floor', 'hit-marker', 'kill-confirm', 'explosion', 'reload-start', 'reload-done', 'casing-land', 'player-hurt'],
  fighter: ['hit-light', 'hit-heavy', 'launcher', 'guard', 'ko', 'knockdown', 'combo-milestone', 'swing-punch', 'swing-kick', 'round-start', 'fight'],
  soulslike: ['hit-light', 'hit-heavy', 'parry', 'stagger', 'roll', 'bonfire-rest', 'you-died', 'stamina-out', 'stamina-denied', 'boss-roar', 'boss-felled'],
  'character-action': ['slash', 'slash-heavy', 'launcher', 'juggle', 'slam', 'style-up', 'style-top', 'dash', 'arena-seal', 'arena-clear', 'player-hurt'],
};

describe.each(GENRES)('%s moments', (genre) => {
  it('defines every moment the genre promises, each using real sfx and particle presets', async () => {
    const { MOMENTS } = await load(`genres/${genre}/src/genre/moments.js`);
    const { SFX_NAMES } = await load('kit/core/sfx.js');
    const { PARTICLE_PRESETS } = await load('kit/core/juice-core.js');
    for (const name of REQUIRED[genre]) expect(MOMENTS[name], `${genre} moment ${name}`).toBeDefined();
    for (const [name, m] of Object.entries<any>(MOMENTS)) { // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const cue of m.sfx ?? []) {
        expect(SFX_NAMES, `${genre}.${name} sfx`).toContain(cue.name);
        expect(cue.pitch ?? 1).toBeGreaterThan(0.2);
        expect(cue.pitch ?? 1).toBeLessThan(4);
        expect(cue.power ?? 1).toBeGreaterThan(0);
        expect(cue.power ?? 1).toBeLessThanOrEqual(1.5);
      }
      for (const burst of m.particles ?? []) expect(Object.keys(PARTICLE_PRESETS), `${genre}.${name} particles`).toContain(burst.kind);
      for (const key of ['shake', 'flash', 'aberration']) if (m[key] !== undefined) expect(m[key]).toBeGreaterThan(0), expect(m[key]).toBeLessThanOrEqual(1);
      if (m.hitStop !== undefined) expect(m.hitStop).toBeGreaterThan(0), expect(m.hitStop).toBeLessThanOrEqual(250);
      if (m.slowMo) {
        expect(m.slowMo).toHaveLength(2);
        expect(m.slowMo[0]).toBeGreaterThan(0);
        expect(m.slowMo[0]).toBeLessThan(1);
        expect(m.slowMo[1]).toBeLessThanOrEqual(2);
      }
      // A moment that does nothing is a mistake.
      expect(Object.keys(m).length, `${genre}.${name} is empty`).toBeGreaterThan(0);
    }
  });

  it('ships the same fx.js as its siblings (one wiring, per-genre tables)', async () => {
    const mine = await readFile(join(root, 'genres', genre, 'src/genre/fx.js'), 'utf8');
    const shooter = await readFile(join(root, 'genres/shooter/src/genre/fx.js'), 'utf8');
    expect(mine).toBe(shooter);
  });
});

describe('shooter helpers', () => {
  it('faceNormal picks the face a point sits on', async () => {
    const { faceNormal } = await load('genres/shooter/src/genre/moments.js');
    const box = { min: [-1, 0, -1], max: [1, 2, 1] };
    expect(faceNormal(box, [1, 1, 0])).toEqual([1, 0, 0]);
    expect(faceNormal(box, [-1, 1.2, 0.3])).toEqual([-1, 0, 0]);
    expect(faceNormal(box, [0, 2, 0.2])).toEqual([0, 1, 0]);
    expect(faceNormal(box, [0.2, 1, -1])).toEqual([0, 0, -1]);
    expect(faceNormal(box, [0.1, 1, 1])).toEqual([0, 0, 1]);
  });

  it('casingEject ejects to the right and up, and replays identically from the same seed', async () => {
    const { casingEject, markerScale } = await load('genres/shooter/src/genre/moments.js');
    const { createRng } = await load('kit/core/rng.js');
    const a = casingEject(createRng(7), [1, 0, 0], [0, 0, -1]);
    const b = casingEject(createRng(7), [1, 0, 0], [0, 0, -1]);
    expect(a).toEqual(b);
    expect(a.velocity[0]).toBeGreaterThan(2);
    expect(a.velocity[1]).toBeGreaterThan(2);
    expect(a.velocity[2]).toBeGreaterThan(0); // back toward the shooter (forward is -z)
    expect(markerScale('kill')).toBeGreaterThan(markerScale('crit'));
    expect(markerScale('crit')).toBeGreaterThan(markerScale('hit'));
  });
});

describe('fighter helpers', () => {
  it('classifies blows and grows the combo counter', async () => {
    const { classifyHit, comboTier, contactHeight } = await load('genres/fighter/src/genre/moments.js');
    expect(classifyHit({ damage: 15, launcher: true })).toBe('launcher');
    expect(classifyHit({ damage: 16 })).toBe('hit-heavy');
    expect(classifyHit({ damage: 7, juggled: true })).toBe('hit-heavy');
    expect(classifyHit({ damage: 7 })).toBe('hit-light');
    expect(comboTier(1).label).toBe('1 HIT');
    expect(comboTier(4).label).toBe('4 HITS');
    expect(comboTier(3).milestone).toBe(true);
    expect(comboTier(4).milestone).toBe(false);
    expect(comboTier(12).size).toBeGreaterThan(comboTier(3).size);
    expect(comboTier(12).size).toBeLessThanOrEqual(64);
    expect(contactHeight('low', false)).toBeLessThan(contactHeight('mid', false));
    expect(contactHeight('high', false)).toBeGreaterThan(contactHeight('mid', false));
    expect(contactHeight('high', true)).toBeLessThan(contactHeight('high', false));
  });

  it('simSteps runs the frame-counted fight at full speed, a fraction in slow motion, and not at all in a hit-stop', async () => {
    const { simSteps } = await load('genres/fighter/src/genre/moments.js');
    const run = (scale: number, frames: number) => {
      let acc = 0;
      let steps = 0;
      for (let i = 0; i < frames; i += 1) {
        const r = simSteps(acc, (1 / 60) * scale);
        acc = r.accumulator;
        steps += r.steps;
      }
      return steps;
    };
    expect(run(1, 60)).toBe(60);
    expect(run(0, 60)).toBe(0);
    expect(run(0.25, 60)).toBeGreaterThanOrEqual(14);
    expect(run(0.25, 60)).toBeLessThanOrEqual(16);
  });
});

describe('soulslike helpers', () => {
  it('flicker stays in range, the curtain fades in and out, and a roll tucks forward then recovers', async () => {
    const { flicker, curtainLevel, rollLean } = await load('genres/soulslike/src/genre/moments.js');
    for (let t = 0; t < 20; t += 0.37) {
      expect(flicker(t)).toBeGreaterThanOrEqual(0);
      expect(flicker(t)).toBeLessThanOrEqual(1);
    }
    expect(flicker(3.3, 1)).toBe(flicker(3.3, 1));
    const plan = { in: 1, hold: 2, out: 1 };
    expect(curtainLevel(0, plan)).toBe(0);
    expect(curtainLevel(1, plan)).toBe(1);
    expect(curtainLevel(2, plan)).toBe(1);
    expect(curtainLevel(3.5, plan)).toBeGreaterThan(0);
    expect(curtainLevel(3.5, plan)).toBeLessThan(1);
    expect(curtainLevel(4, plan)).toBe(0);
    expect(rollLean(0, 0.5)).toBeCloseTo(0);
    expect(rollLean(0.25, 0.5)).toBeLessThan(-1);
    expect(rollLean(0.5, 0.5)).toBeCloseTo(0);
  });
});

describe('character-action helpers', () => {
  it('has a slash arc for every ground and air move', async () => {
    const { ARCS } = await load('genres/character-action/src/genre/moments.js');
    const { COMBO_MOVES } = await load('kit/core/genre/character-action/combos.js');
    for (const move of COMBO_MOVES) expect(ARCS[move.name], `arc for ${move.name}`).toBeDefined();
  });

  it('picks the hit moment, the rank call and the afterimage cadence', async () => {
    const { hitMoment, rankCall, wantsGhost, ghostAlpha } = await load('genres/character-action/src/genre/moments.js');
    expect(hitMoment({ name: 'launcher', damage: 10, launcher: true }, false)).toBe('launcher');
    expect(hitMoment({ name: 'slam', damage: 18 }, true)).toBe('slam');
    expect(hitMoment({ name: 'finisher', damage: 22 }, false)).toBe('hit-heavy');
    expect(hitMoment({ name: 'air-1', damage: 7 }, true)).toBe('juggle');
    expect(hitMoment({ name: 'slash-1', damage: 8 }, false)).toBe('hit-light');
    expect(rankCall(6, 'SSS').size).toBeGreaterThan(rankCall(0, 'D').size);
    expect(rankCall(6, 'SSS').pitch).toBeGreaterThan(rankCall(0, 'D').pitch);
    expect(rankCall(3, 'A').top).toBe(false);
    expect(rankCall(4, 'S').top).toBe(true);
    expect(wantsGhost(6, 3)).toBe(true);
    expect(wantsGhost(6, 4)).toBe(false);
    expect(wantsGhost(2, 3)).toBe(false);
    expect(ghostAlpha(0, 0.3)).toBeGreaterThan(ghostAlpha(0.2, 0.3));
    expect(ghostAlpha(0.3, 0.3)).toBe(0);
  });
});
