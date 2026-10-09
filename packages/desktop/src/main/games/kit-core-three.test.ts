import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CAMERA_IDS, GAME_CAMERA_OFFSETS, GAME_GENRES } from '@midnite/studio-shared';
import { beforeAll, describe, expect, it } from 'vitest';

import { encodePngGrey16 } from '../media/png/png-codec';

/**
 * The engine-free maths under the three.js kit (Phase 107 Theme F), imported
 * straight from `templates/media-game/kit/core/`. The `kit/three/` adapters
 * need WebGL and are covered by the real-Chromium smoke run; what decides
 * *where* a camera goes, *how many* steps run, and *what* a terrain pack
 * contains is all here.
 */

const coreDir = resolve(__dirname, '../../../../../templates/media-game/kit/core');
const fixtureDir = join(__dirname, '__fixtures__', 'terrain-pack');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(coreDir, file)).href);
const fixture = async (file: string): Promise<unknown> => JSON.parse(await readFile(join(fixtureDir, file), 'utf8'));

describe('kit/core/cameras.js', () => {
  it('names the five presets in the shared order, with the doc table offsets', async () => {
    const { CAMERA_IDS, CAMERA_OFFSETS } = await load('cameras.js');
    expect(CAMERA_IDS).toEqual([...GAME_CAMERA_IDS]);
    expect(CAMERA_OFFSETS).toEqual({
      'over-shoulder-left': [-0.7, 0.2, 2.4],
      'over-shoulder-right': [0.7, 0.2, 2.4],
      behind: [0, 0.4, 4.0],
      'further-behind': [0, 1.2, 7.0],
      'much-further-behind': [0, 3.0, 12.0],
    });
    expect(CAMERA_OFFSETS).toEqual(GAME_CAMERA_OFFSETS);
  });

  it('pulls the spring arm in short of an obstruction, and leaves it alone otherwise', async () => {
    const { springArmDistance, relaxArm } = await load('cameras.js');
    expect(springArmDistance(4, 1.5)).toBeCloseTo(1.3, 12);
    expect(springArmDistance(4, null)).toBe(4);
    expect(springArmDistance(4, 6)).toBe(4);
    expect(springArmDistance(4, 0.1)).toBe(0);
    // Snaps in, eases out at 4 m/s.
    expect(relaxArm(4, 1.3, 1 / 60)).toBe(1.3);
    expect(relaxArm(1.3, 4, 0.25)).toBeCloseTo(2.3, 12);
    expect(relaxArm(3.9, 4, 1)).toBe(4);
  });

  it('cycles the presets, limited by the manifest cameraPresets', async () => {
    const { nextCamera } = await load('cameras.js');
    expect(nextCamera('over-shoulder-left')).toBe('over-shoulder-right');
    expect(nextCamera('much-further-behind')).toBe('over-shoulder-left');
    expect(nextCamera('behind', ['behind', 'much-further-behind'])).toBe('much-further-behind');
    expect(nextCamera('much-further-behind', ['behind', 'much-further-behind'])).toBe('behind');
    // A preset outside the allowed set jumps to the first allowed one.
    expect(nextCamera('over-shoulder-left', ['further-behind'])).toBe('further-behind');
  });

  it('puts each preset behind the player for any yaw', async () => {
    const { cameraArm, orbitOffset } = await load('cameras.js');
    // Looking down −z (yaw 0), "behind" is +z.
    expect(orbitOffset([0, 0, 4], 0)).toEqual([0, 0, 4]);
    // Turned to look down −x (yaw π/2), behind is +x and the right shoulder is −z.
    const behind = orbitOffset([0, 0, 4], Math.PI / 2);
    expect(behind[0]).toBeCloseTo(4, 12);
    expect(behind[2]).toBeCloseTo(0, 12);
    const right = orbitOffset([0.7, 0, 0], Math.PI / 2);
    expect(right[2]).toBeCloseTo(-0.7, 12);
    const arm = cameraArm('much-further-behind', 0);
    expect(arm.length).toBeCloseTo(Math.hypot(3, 12), 12);
    expect(Math.hypot(...arm.direction)).toBeCloseTo(1, 12);
  });

  it('turns input into camera-relative ground motion', async () => {
    const { moveRelativeToYaw } = await load('cameras.js');
    const forward = moveRelativeToYaw({ x: 0, y: -1 }, 0);
    expect(forward[0]).toBeCloseTo(0, 12);
    expect(forward[1]).toBeCloseTo(-1, 12);
    const [x, z] = moveRelativeToYaw({ x: 0, y: -1 }, Math.PI / 2);
    expect(x).toBeCloseTo(-1, 12);
    expect(z).toBeCloseTo(0, 12);
  });

  it('locks on to the nearest target in front, within range and angle', async () => {
    const { chooseLockTarget } = await load('cameras.js');
    const ahead = { id: 'ahead', position: [0, 0, -8] };
    const near = { id: 'near-but-behind', position: [0, 0, 3] };
    const far = { id: 'too-far', position: [0, 0, -25] };
    const wide = { id: 'too-wide', position: [6, 0, -1] };
    const closer = { id: 'closer-ahead', position: [1, 0, -5] };
    expect(chooseLockTarget([0, 0, 0], [0, 0, -1], [ahead, near, far, wide])?.id).toBe('ahead');
    expect(chooseLockTarget([0, 0, 0], [0, 0, -1], [ahead, closer])?.id).toBe('closer-ahead');
    expect(chooseLockTarget([0, 0, 0], [0, 0, -1], [near, far, wide])).toBeNull();
  });

  it('frames two fighters side-on with the versus camera', async () => {
    const { versusCamera } = await load('cameras.js');
    const shot = versusCamera([-2, 0, 0], [2, 0, 0]);
    expect(shot.target[0]).toBeCloseTo(0, 12);
    expect(shot.target[2]).toBeCloseTo(0, 12);
    // Perpendicular to the line between them: straight out along z.
    expect(shot.position[0]).toBeCloseTo(0, 12);
    expect(Math.abs(shot.position[2])).toBeGreaterThanOrEqual(4);
  });

  it('clamps the first-person FOV to 60–100° and bobs only when moving', async () => {
    const { clampFirstPersonFov, headBob } = await load('cameras.js');
    expect(clampFirstPersonFov(120)).toBe(100);
    expect(clampFirstPersonFov(40)).toBe(60);
    expect(clampFirstPersonFov(75)).toBe(75);
    expect(Math.abs(headBob(0.3, 0))).toBe(0);
    expect(Math.abs(headBob(0.14, 6))).toBeGreaterThan(0);
  });
});

describe('kit/core/clock.js createFixedStep', () => {
  it('accumulates real time into whole steps and an interpolation alpha', async () => {
    const { createFixedStep } = await load('clock.js');
    const fixed = createFixedStep(60);
    expect(fixed.advance(50)).toEqual({ steps: 3, alpha: 0 });
    const partial = fixed.advance(25);
    expect(partial.steps).toBe(1);
    expect(partial.alpha).toBeCloseTo(0.5, 9);
    expect(fixed.dt).toBeCloseTo(1 / 60, 12);
  });

  it('caps a long stall at five steps and drops the rest', async () => {
    const { createFixedStep } = await load('clock.js');
    const fixed = createFixedStep(60);
    expect(fixed.advance(1000)).toEqual({ steps: 5, alpha: 0 });
    expect(fixed.advance(0).steps).toBe(0);
  });
});

describe('kit/core/terrain-manifest.js', () => {
  it("accepts the Phase 105 fixture pack's manifest and heightfield.json", async () => {
    const { parseTerrainManifest, parseHeightfieldInfo } = await load('terrain-manifest.js');
    const manifest = parseTerrainManifest(await fixture('terrain.manifest.json'));
    expect(manifest.ok).toBe(true);
    expect(manifest.value.chunks.lods.map((l: { lod: number }) => l.lod)).toEqual([0, 1, 2, 3]);
    expect(parseHeightfieldInfo(await fixture('heightfield.json')).ok).toBe(true);
  });

  it('rejects version 2 and a manifest missing its heightfield, and ignores unknown keys', async () => {
    const { parseTerrainManifest } = await load('terrain-manifest.js');
    const base = (await fixture('terrain.manifest.json')) as Record<string, unknown>;
    const v2 = parseTerrainManifest({ ...base, version: 2 });
    expect(v2).toEqual({ ok: false, message: 'terrain manifest: version 2 is not supported (this kit reads version 1).' });
    const { heightfield: _omit, ...noHeightfield } = base;
    expect(parseTerrainManifest(noHeightfield)).toEqual({
      ok: false,
      message: 'terrain manifest: "heightfield" is missing or invalid.',
    });
    expect(parseTerrainManifest({ ...base, chunks: { verts: 65, perSide: 2, lods: [{ lod: 4, glb: 'x.glb' }] } }).ok).toBe(false);
    expect(parseTerrainManifest({ ...base, somethingNew: { a: 1 } }).ok).toBe(true);
  });

  it('resolves pack paths against the manifest URL', async () => {
    const { resolveTerrainPath } = await load('terrain-manifest.js');
    expect(resolveTerrainPath('mstudio-game://g/assets/terrain/hills/terrain.manifest.json', 'chunks/lod0.glb')).toBe(
      'mstudio-game://g/assets/terrain/hills/chunks/lod0.glb',
    );
    expect(resolveTerrainPath('assets/terrain/hills/terrain.manifest.json', 'heightfield.png')).toBe(
      '/assets/terrain/hills/heightfield.png',
    );
  });
});

describe('kit/core/lod.js', () => {
  it('matches the Terrain tab chunk rules', async () => {
    const { chunkVerts, chunksPerSide, chunkWorldSize, selectLod, chunkCentre, parseChunkName } = await load('lod.js');
    expect(chunkVerts(1025)).toBe(65);
    expect(chunkVerts(2049)).toBe(129);
    expect(chunksPerSide(129)).toBe(2);
    expect(chunkWorldSize(129, 128)).toBe(64);
    expect([0, 95, 96, 191, 192, 383, 384].map((d) => selectLod(d, 64))).toEqual([0, 0, 1, 1, 2, 2, 3]);
    expect(chunkCentre(0, 0, 129, 128)).toEqual([-32, -32]);
    expect(chunkCentre(1, 0, 129, 128)).toEqual([32, -32]);
    expect(parseChunkName('chunk_3_12')).toEqual({ cx: 3, cz: 12 });
    expect(parseChunkName('roads')).toBeNull();
  });
});

describe('kit/core/png16.js and heightfield.js', () => {
  const res = 129;
  const heights = new Float32Array(res * res);
  for (let j = 0; j < res; j += 1) {
    for (let i = 0; i < res; i += 1) heights[j * res + i] = 10 + 9 * Math.sin(i / 9) * Math.cos(j / 13) + j * 0.004;
  }

  beforeAll(async () => {
    await RAPIER.init();
  });

  it('decodes a 16-bit PNG from the exporter bit-exactly', async () => {
    const { quantiseHeights } = await load('heightfield.js');
    const { decodePng16 } = await load('png16.js');
    const samples: Uint16Array = quantiseHeights(heights, [0, 20]);
    // Every filter type turns up across a smooth field like this one.
    const png = encodePngGrey16(samples, res, res);
    const decoded = await decodePng16(new Uint8Array(png));
    expect(decoded).toMatchObject({ width: res, height: res, bitDepth: 16, channels: 1 });
    expect(decoded.data).toEqual(samples);
  });

  it('rejects something that is not a PNG', async () => {
    const { decodePng16 } = await load('png16.js');
    await expect(decodePng16(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).rejects.toThrow('Not a PNG file.');
  });

  it('builds a Rapier heightfield collider that agrees with heightAt', async () => {
    const { createHeightfield, quantiseHeights, toRapierHeights } = await load('heightfield.js');
    const info = { resolution: res, worldSize: 128, heightRange: [0, 20] };
    const field = createHeightfield(quantiseHeights(heights, info.heightRange), info);
    // Quantisation to 16 bits loses well under a millimetre over 20 m.
    expect(Math.abs(field.heightAt(0, 0) - (heights[64 * res + 64] ?? 0))).toBeLessThan(1e-3);

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(
      RAPIER.ColliderDesc.heightfield(res - 1, res - 1, toRapierHeights(field.heights, res), { x: 128, y: 1, z: 128 }),
    );
    world.step();
    for (const [x, z] of [[-64, -64], [64, -64], [-64, 64], [10.3, -27.9], [-40.25, 33.5]] as const) {
      const hit = world.castRay(new RAPIER.Ray({ x, y: 100, z }, { x: 0, y: -1, z: 0 }), 200, true);
      expect(hit).not.toBeNull();
      expect(100 - (hit?.timeOfImpact ?? 0)).toBeCloseTo(field.heightAt(x, z), 4);
    }
    world.free();
  });
});

describe('kit/core/clip-names.js', () => {
  it('matches Models-tab and foreign clip names to animator states', async () => {
    const { matchClips, locomotionState } = await load('clip-names.js');
    expect(matchClips(['idle', 'walk', 'run', 'jump', 'getHit', 'die'])).toEqual({
      idle: 'idle',
      walk: 'walk',
      run: 'run',
      jump: 'jump',
      hit: 'getHit',
      die: 'die',
    });
    expect(matchClips(['Armature|Idle', 'Running', 'RUN_FAST', 'Death', 'Punch'])).toEqual({
      idle: 'Armature|Idle',
      run: 'Running',
      attack: 'Punch',
      die: 'Death',
    });
    expect(locomotionState({ speed: 0, grounded: true })).toBe('idle');
    expect(locomotionState({ speed: 2, grounded: true, runSpeed: 6 })).toBe('walk');
    expect(locomotionState({ speed: 6, grounded: true, runSpeed: 6 })).toBe('run');
    expect(locomotionState({ speed: 6, grounded: false })).toBe('jump');
  });
});

describe('kit/core/vehicle.js, road-ribbon.js, nav-policy.js and dom-keys.js', () => {
  it('lays out four wheels, front pair first, and finds a door within 2.5 m', async () => {
    const { wheelLayout, findEnterable, driveControls } = await load('vehicle.js');
    const wheels = wheelLayout([0.9, 0.4, 2]);
    expect(wheels).toHaveLength(4);
    expect(wheels[0][2]).toBeLessThan(0);
    expect(wheels[3][2]).toBeGreaterThan(0);
    const car = { id: 'car', door: [3, 0, 0] };
    expect(findEnterable([1, 0, 0], [car])).toBe(car);
    expect(findEnterable([0, 0, 0], [car])).toBeNull();
    // Throttle against the direction of travel brakes before it reverses.
    expect(driveControls({ throttle: -1, steer: 0 }, 10)).toMatchObject({ engineForce: 0 });
    expect(driveControls({ throttle: -1, steer: 0 }, 10).brake).toBeGreaterThan(0);
    expect(driveControls({ throttle: 1, steer: 0 }, 0).engineForce).toBeGreaterThan(0);
  });

  it('builds an upward-facing road ribbon and node adjacency', async () => {
    const { roadRibbon, roadAdjacency } = await load('road-ribbon.js');
    const { positions, indices } = roadRibbon([[0, 0, 0], [10, 0, 0], [20, 1, 0]], 4);
    expect(positions).toHaveLength(18);
    expect(indices).toHaveLength(12);
    // First triangle's normal points up.
    const p = (i: number): number[] => [positions[i * 3] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0];
    const [a, b, c] = [p(indices[0] ?? 0), p(indices[1] ?? 0), p(indices[2] ?? 0)];
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    expect(u[2]! * v[0]! - u[0]! * v[2]!).toBeGreaterThan(0);
    expect(Math.abs((positions[2] ?? 0) - (positions[5] ?? 0))).toBeCloseTo(4, 9);
    const adjacency = roadAdjacency({
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }],
      edges: [{ id: 5, a: 0, b: 1 }, { id: 6, a: 1, b: 2 }],
    });
    expect(adjacency.get(1)).toEqual([5, 6]);
  });

  it('loads the navmesh only for genres that path AI', async () => {
    const { needsNav, NAV_GENRES } = await load('nav-policy.js');
    for (const genre of NAV_GENRES) expect(GAME_GENRES).toContain(genre);
    expect(['shooter', 'rpg', 'soulslike', 'open-world'].every(needsNav)).toBe(true);
    expect(['fighter', 'character-action', 'fps', null].some(needsNav)).toBe(false);
  });

  it('names DOM key codes the way bindings do', async () => {
    const { domKeyName } = await load('dom-keys.js');
    expect(['KeyW', 'Space', 'ShiftLeft', 'Escape', 'ArrowUp', 'Digit1'].map(domKeyName)).toEqual([
      'W',
      'SPACE',
      'SHIFT',
      'ESC',
      'UP',
      '1',
    ]);
  });
});
