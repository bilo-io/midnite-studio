// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { GAME_LEVEL_PROPS, LEVEL_POST_PRESETS, LEVEL_SKY_PRESETS, levelEnvironment } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

/**
 * Phase 144 Themes A3 and F: the kit reads the level's environment. Imported straight from `templates/media-game/kit/`
 * (plain JS, no browser capability needed): the JS `levelEnvironment` must agree with shared's, the sky and post
 * preset lists must match the kit's, and `createEnvironment().applyLevel` must pick the level's values.
 */
const kitDir = resolve(__dirname, '../../../../../templates/media-game/kit');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(kitDir, file)).href);

const prop = (name: string, value: unknown) => ({ name, value });
const FIXTURES: Array<Array<[string, unknown]>> = [
  [],
  [[GAME_LEVEL_PROPS.sky, 'dusk'], [GAME_LEVEL_PROPS.post, 'cinematic']],
  [[GAME_LEVEL_PROPS.sunAzimuth, 120], [GAME_LEVEL_PROPS.sunElevation, -5], [GAME_LEVEL_PROPS.fog, true], [GAME_LEVEL_PROPS.fogNear, 20], [GAME_LEVEL_PROPS.fogFar, 90]],
  [[GAME_LEVEL_PROPS.sky, 'plaid'], [GAME_LEVEL_PROPS.sunAzimuth, 400], [GAME_LEVEL_PROPS.sunElevation, 95], [GAME_LEVEL_PROPS.post, 'noir']],
  [[GAME_LEVEL_PROPS.fogNear, 80], [GAME_LEVEL_PROPS.fogFar, 40], [GAME_LEVEL_PROPS.fog, 'yes']],
  [[GAME_LEVEL_PROPS.weather, 'rain'], [GAME_LEVEL_PROPS.weatherOptions, 'clear, rain,rain'], [GAME_LEVEL_PROPS.timeOfDay, 99], [GAME_LEVEL_PROPS.timeScale, -1]],
];

describe('kit levelEnvironment (Phase 144)', () => {
  it('A3: LEVEL_SKY_PRESETS equals the kit SKY_PRESETS keys', async () => {
    const { SKY_PRESETS } = await load('core/sky.js');
    expect([...LEVEL_SKY_PRESETS]).toEqual(Object.keys(SKY_PRESETS));
  });
  it('LEVEL_POST_PRESETS equals the kit POST_PRESETS keys', async () => {
    // postfx.js imports three's addons; read the table from source instead of loading it.
    const src = await readFile(join(kitDir, 'three/postfx.js'), 'utf8');
    const start = src.indexOf('export const POST_PRESETS');
    const block = src.slice(start, src.indexOf('\n};', start));
    expect([...block.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1])).toEqual([...LEVEL_POST_PRESETS]);
  });
  it.each(FIXTURES.map((f, i) => [i, f] as const))('F3: JS and TS levelEnvironment agree on fixture %i', async (_i, f) => {
    const { levelEnvironment: js } = await load('core/level.js');
    const props = f.map(([n, v]) => prop(n, v));
    expect(js({ properties: props })).toEqual(levelEnvironment({ properties: props }));
  });
  it('F2: a level with no props yields null for every new field', async () => {
    const { levelEnvironment: js } = await load('core/level.js');
    expect(js({})).toMatchObject({ sky: null, sunAzimuth: null, sunElevation: null, fog: null, fogNear: null, fogFar: null, post: null });
  });
});

describe('createEnvironment().applyLevel (F1)', () => {
  it('takes the level values over the genre default, and keeps the default without a prop', async () => {
    const THREE = await import('three');
    const { createEnvironment } = await load('three/environment.js');
    const { levelEnvironment: js } = await load('core/level.js');
    const { SKY_PRESETS } = await load('core/sky.js');
    const scene = new THREE.Scene();
    const env = createEnvironment({ scene, preset: 'day', fog: [30, 85] });
    const horizon = () => env.dome.material.uniforms.uHorizon.value.getHex();
    const dayHorizon = horizon();
    env.applyLevel(js({}));
    expect(horizon()).toBe(dayHorizon);
    env.applyLevel(js({ properties: [prop('midnite.sky', 'dusk')] }));
    expect(horizon()).toBe(SKY_PRESETS.dusk.horizon);
    env.applyLevel(js({ properties: [prop('midnite.fog', false)] }));
    expect(scene.fog).toBeNull();
    env.applyLevel(js({ properties: [prop('midnite.fog', true), prop('midnite.fogNear', 10), prop('midnite.fogFar', 50)] }));
    expect(scene.fog).toMatchObject({ near: 10, far: 50 });
    env.applyLevel(js({ properties: [prop('midnite.sunElevation', 45), prop('midnite.sunAzimuth', 0)] }));
    expect(env.state().sun.y).toBeCloseTo(Math.sin(Math.PI / 4), 2);
    env.dispose();
  });
});
