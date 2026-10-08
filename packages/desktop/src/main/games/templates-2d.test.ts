import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The pure halves of the 2D fidelity work, imported straight from `templates/media-game/bases/`: the raycaster's
 * shading math (`shade.js`) and the isometric/top-down surface geometry (`lit-math.js`). The renderers that use
 * them need a canvas and WebGL and are covered by the screenshots in the PR. Plain vitest: no browser capability needed.
 */

const bases = resolve(__dirname, '../../../../../templates/media-game/bases');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(bases, file)).href);
const read = (file: string) => readFile(join(bases, file), 'utf8');

describe('raycaster shade.js', () => {
  it('a normal facing the light is fully lit; one facing away is dark', async () => {
    const { lambert } = await load('raycaster/src/shade.js');
    expect(lambert(0, 0, 1, 0, 0, 3)).toBeCloseTo(1, 9);
    expect(lambert(0, 0, 1, 0, 0, -3)).toBe(0);
    expect(lambert(1, 0, 0, 0, 0, 1)).toBeCloseTo(0, 9);
  });

  it('light falls off with distance', async () => {
    const { falloff } = await load('raycaster/src/shade.js');
    expect(falloff(0)).toBe(1);
    expect(falloff(4)).toBeGreaterThan(falloff(16));
    expect(falloff(100)).toBeGreaterThan(0);
  });

  it('floor row distance inverts the wall line height and is infinite on the horizon', async () => {
    const { floorRowDistance } = await load('raycaster/src/shade.js');
    // A wall at distance d spans H / d rows, so its base is H / (2d) below the horizon: the floor there is d away.
    const H = 200;
    const d = 4;
    expect(floorRowDistance(H / 2 + H / (2 * d), H / 2, H)).toBeCloseTo(d, 9);
    expect(floorRowDistance(H / 2, H / 2, H)).toBe(Infinity);
    expect(floorRowDistance(H / 2 - H / (2 * d), H / 2, H)).toBeCloseTo(d, 9);
  });

  it('a wall light vector points at the player and its normal part is never negative', async () => {
    const { wallLight } = await load('raycaster/src/shade.js');
    const a = wallLight(0, 1, 0.5, 2);
    expect(a.ln).toBeCloseTo(2, 9);
    expect(a.lu).toBeCloseTo(-1, 9);
    const b = wallLight(1, -0.5, -1, 3);
    expect(b.ln).toBeCloseTo(3, 9);
    expect(b.lu).toBeCloseTo(1.5, 9);
  });

  it('packs little-endian RGBA and clamps', async () => {
    const { packRgb } = await load('raycaster/src/shade.js');
    expect(packRgb(1, 2, 3)).toBe(0xff030201);
    expect(packRgb(999, -5, 128)).toBe(0xff8000ff);
  });
});

describe('isometric lit-math.js', () => {
  it('maps a diamond to texture space, with the corners at the extremes and nothing outside', async () => {
    const { isoUV } = await load('top-down/src/lit-math.js');
    const centre = isoUV(31, 15, 64, 32);
    expect(centre.u).toBeCloseTo(0.5, 1);
    expect(centre.v).toBeCloseTo(0.5, 1);
    expect(isoUV(0, 0, 64, 32)).toBeNull();
    expect(isoUV(63, 31, 64, 32)).toBeNull();
    // Right of the centre is further along grid x; left of it further along grid y.
    expect(isoUV(48, 15, 64, 32).u).toBeGreaterThan(isoUV(16, 15, 64, 32).u);
    expect(isoUV(16, 15, 64, 32).v).toBeGreaterThan(isoUV(48, 15, 64, 32).v);
  });

  it('splits a block into a top and two sides that tile its silhouette without overlap', async () => {
    const { classifyBlockPixel } = await load('top-down/src/lit-math.js');
    const counts = { top: 0, left: 0, right: 0, none: 0 };
    for (let y = 0; y < 32 + 36; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const hit = classifyBlockPixel(x, y, 64, 32, 36);
        counts[(hit ? hit.face : 'none') as keyof typeof counts] += 1;
      }
    }
    expect(counts.top).toBeGreaterThan(900);
    // The two sides are mirror images.
    expect(Math.abs(counts.left - counts.right)).toBeLessThanOrEqual(40);
    expect(counts.left).toBeGreaterThan(900);
    // Every texture coordinate stays in 0..1.
    for (let y = 0; y < 68; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const hit = classifyBlockPixel(x, y, 64, 32, 36);
        if (hit) {
          expect(hit.u).toBeGreaterThanOrEqual(0);
          expect(hit.u).toBeLessThanOrEqual(1);
          expect(hit.v).toBeGreaterThanOrEqual(0);
          expect(hit.v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('face normals are unit length and point the way the faces do', async () => {
    const { FACE_NORMALS } = await load('top-down/src/lit-math.js');
    for (const n of Object.values(FACE_NORMALS) as number[][]) expect(Math.hypot(n[0]!, n[1]!, n[2]!)).toBeCloseTo(1, 1);
    expect(FACE_NORMALS.left[0]).toBeLessThan(0);
    expect(FACE_NORMALS.right[0]).toBeGreaterThan(0);
    expect(FACE_NORMALS.top[1]).toBeGreaterThan(0);
  });

  it('a dome normal is straight up at the centre and flat at the rim, and absent outside', async () => {
    const { domeNormal } = await load('top-down/src/lit-math.js');
    expect(domeNormal(0, 0)).toEqual([0, -0, 1]);
    expect(domeNormal(1, 0)![2]).toBeCloseTo(0, 9);
    expect(domeNormal(0.8, 0.8)).toBeNull();
    // Down on screen is negative green (up-positive normal maps).
    expect(domeNormal(0, 0.5)![1]).toBeLessThan(0);
  });

  it('encodes a straight-up normal as the usual normal-map blue', async () => {
    const { encodeNormal, tiltNormal } = await load('top-down/src/lit-math.js');
    expect(encodeNormal([0, 0, 1])).toEqual([128, 128, 255]);
    const n = tiltNormal([0, 0, 1], 1, 0, 1);
    expect(Math.hypot(...(n as number[]))).toBeCloseTo(1, 9);
    expect(n[0]).toBeGreaterThan(0);
  });

  it('bevels the lit edge up and the shadowed edge down, and leaves the middle alone', async () => {
    const { bevel } = await load('top-down/src/lit-math.js');
    expect(bevel(0, 64)).toBe(1);
    expect(bevel(32, 64)).toBe(0);
    expect(bevel(63, 64)).toBe(-1);
  });
});

describe('the 2D bases share their helpers', () => {
  it('fx.js is identical in all three bases, and lit.js / lit-math.js in the two that use them', async () => {
    const fx = await read('raycaster/src/fx.js');
    expect(await read('top-down/src/fx.js')).toBe(fx);
    expect(await read('isometric/src/fx.js')).toBe(fx);
    expect(await read('isometric/src/lit.js')).toBe(await read('top-down/src/lit.js'));
    expect(await read('isometric/src/lit-math.js')).toBe(await read('top-down/src/lit-math.js'));
  });

  it('kit/ never gained a Math.random or Date.now from this work: the new files use the kit rng and loop dt', async () => {
    for (const file of ['raycaster/src/render.js', 'raycaster/src/shade.js', 'top-down/src/lit.js', 'top-down/src/fx.js', 'raycaster/src/scenes/level.js', 'top-down/src/scenes/level.js', 'isometric/src/scenes/level.js']) {
      const source = await read(file);
      expect(source, file).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });
});
