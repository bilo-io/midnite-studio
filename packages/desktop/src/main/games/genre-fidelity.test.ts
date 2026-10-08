import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The engine-free maths behind the open-world genre's fidelity pass, imported straight from
 * `templates/media-game/genres/open-world/src/genre/`: the land-cover splat (which detail layer each
 * patch of ground wears, and what a footstep sounds like), and the engine and ambience mixes. The
 * three.js parts (ground shader, wind, weather, sky dome) need WebGL and are covered by the PR's screenshots.
 */

const dir = resolve(__dirname, '../../../../../templates/media-game/genres/open-world/src/genre');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(dir, file)).href);

const legend = { classes: ['water', 'tree', 'grass', 'bare', 'rock', 'road', 'building', 'other'] };

describe('open-world ground splat', () => {
  it('every land-cover class has weights that sum to one and a footstep surface', async () => {
    const { SPLAT_WEIGHTS, SURFACES } = await load('ground-splat.js');
    for (const name of legend.classes) {
      const w = SPLAT_WEIGHTS[name] as number[];
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
      expect(SURFACES[name]).toBeDefined();
    }
  });

  it('writes rows bottom-up so north ends up at the top of the texture (v = 1)', async () => {
    const { splatTexture } = await load('ground-splat.js');
    // 2x2 cover: north row grass (2), south row rock (4).
    const rgba = splatTexture([2, 2, 4, 4], 2, legend, 2) as Uint8Array;
    // Texture row 0 is the southernmost: rock, blue channel.
    expect([rgba[0], rgba[1], rgba[2]]).toEqual([0, Math.round(0.1 * 255), Math.round(0.9 * 255)]);
    // Texture row 1 is the north edge: grass, red channel.
    expect([rgba[8], rgba[9], rgba[10]]).toEqual([255, 0, 0]);
  });

  it('classAt reads the class under a world point, north being -z', async () => {
    const { classAt } = await load('ground-splat.js');
    const classes = [2, 2, 4, 4];
    expect(classAt(classes, 2, legend, 100, 0, -40)).toBe('grass');
    expect(classAt(classes, 2, legend, 100, 0, 40)).toBe('rock');
    expect(classAt(classes, 2, legend, 100, 1e6, 1e6)).toBe('rock');
  });
});

describe('open-world sound maths', () => {
  it('engine pitch and loudness rise with speed and throttle', async () => {
    const { engineParams } = await load('sound-math.js');
    const idle = engineParams(0, 0);
    const cruise = engineParams(20, 0.5);
    expect(cruise.frequency).toBeGreaterThan(idle.frequency);
    expect(cruise.gain).toBeGreaterThan(idle.gain);
    expect(engineParams(-20, 0).frequency).toBe(engineParams(20, 0).frequency);
  });

  it('the ambience has crickets at night, birds by day and none in the rain', async () => {
    const { ambienceMix } = await load('sound-math.js');
    expect(ambienceMix(12, 0)).toMatchObject({ birds: 1, crickets: 0 });
    expect(ambienceMix(23, 0)).toMatchObject({ birds: 0, crickets: 1 });
    expect(ambienceMix(12, 0.8).birds).toBe(0);
  });
});
