import { describe, expect, it } from 'vitest';

import { GAME_LEVEL_ENTITY_TYPES_2D, GAME_LEVEL_ENTITY_TYPES_3D, GAME_LEVEL_PROPS, levelEnvironment, levelEnvironmentIssues } from './game-level';
import { spawnerLabel, spawnerShapes } from './game-level-overlays';

const props = (...p: Array<[string, unknown]>) => ({ properties: p.map(([name, value]) => ({ name, value })) });

describe('levelEnvironment', () => {
  it('defaults: auto weather, no clock, scale 1', () => {
    expect(levelEnvironment({})).toMatchObject({ weather: 'auto', weatherOptions: ['auto'], timeOfDay: null, timeScale: 1 });
  });
  it('reads the properties, with auto first in the options and no duplicates', () => {
    const e = levelEnvironment(props([GAME_LEVEL_PROPS.weather, 'rain'], [GAME_LEVEL_PROPS.weatherOptions, 'clear, rain,auto,rain,fog'], [GAME_LEVEL_PROPS.timeOfDay, 18.5], [GAME_LEVEL_PROPS.timeScale, 0]));
    expect(e).toMatchObject({ weather: 'rain', weatherOptions: ['auto', 'clear', 'rain', 'fog'], timeOfDay: 18.5, timeScale: 0 });
  });
  it('clamps time of day and treats wrong types as absent', () => {
    expect(levelEnvironment(props([GAME_LEVEL_PROPS.timeOfDay, 99])).timeOfDay).toBe(24);
    expect(levelEnvironment(props([GAME_LEVEL_PROPS.timeOfDay, -3])).timeOfDay).toBe(0);
    expect(levelEnvironment(props([GAME_LEVEL_PROPS.timeOfDay, '12'], [GAME_LEVEL_PROPS.timeScale, -2], [GAME_LEVEL_PROPS.weather, 4]))).toMatchObject({ timeOfDay: null, timeScale: 0, weather: 'auto' });
  });
});

const NEW_NULL = { sky: null, sunAzimuth: null, sunElevation: null, fog: null, fogNear: null, fogFar: null, post: null };

describe('levelEnvironment, Phase 144 props', () => {
  it('A1: none of the new props yields null for each, and no issues', () => {
    expect(levelEnvironment({})).toMatchObject(NEW_NULL);
    expect(levelEnvironmentIssues({})).toEqual([]);
  });
  it('reads valid values', () => {
    const e = levelEnvironment(props([GAME_LEVEL_PROPS.sky, 'dusk'], [GAME_LEVEL_PROPS.sunAzimuth, 120], [GAME_LEVEL_PROPS.sunElevation, -5], [GAME_LEVEL_PROPS.fog, true], [GAME_LEVEL_PROPS.fogNear, 20], [GAME_LEVEL_PROPS.fogFar, 90], [GAME_LEVEL_PROPS.post, 'cinematic']));
    expect(e).toMatchObject({ sky: 'dusk', sunAzimuth: 120, sunElevation: -5, fog: true, fogNear: 20, fogFar: 90, post: 'cinematic' });
  });
  it('A2: out-of-range or unknown values read null with one issue each', () => {
    const level = props([GAME_LEVEL_PROPS.sky, 'plaid'], [GAME_LEVEL_PROPS.sunAzimuth, 400], [GAME_LEVEL_PROPS.sunElevation, 95], [GAME_LEVEL_PROPS.fogNear, -1], [GAME_LEVEL_PROPS.post, 'noir']);
    expect(levelEnvironment(level)).toMatchObject(NEW_NULL);
    expect(levelEnvironmentIssues(level)).toHaveLength(5);
  });
  it('fogNear must be below fogFar: both read null with one issue', () => {
    const level = props([GAME_LEVEL_PROPS.fogNear, 80], [GAME_LEVEL_PROPS.fogFar, 40]);
    expect(levelEnvironment(level)).toMatchObject({ fogNear: null, fogFar: null });
    expect(levelEnvironmentIssues(level)).toHaveLength(1);
  });
  it('a wrong type reads as absent without an issue', () => {
    const level = props([GAME_LEVEL_PROPS.sky, 3], [GAME_LEVEL_PROPS.sunAzimuth, '10'], [GAME_LEVEL_PROPS.fog, 'yes']);
    expect(levelEnvironment(level)).toMatchObject(NEW_NULL);
    expect(levelEnvironmentIssues(level)).toEqual([]);
  });
});

describe('spawner', () => {
  it('is in both entity palettes', () => {
    expect(GAME_LEVEL_ENTITY_TYPES_2D).toContain('spawner');
    expect(GAME_LEVEL_ENTITY_TYPES_3D).toContain('spawner');
  });
  it('labels kind and density with defaults', () => {
    expect(spawnerLabel(props(['spawns', 'traffic'], ['density', 1.5]))).toBe('traffic ×1.5');
    expect(spawnerLabel({})).toBe('traffic ×1');
  });
  it('finds spawner objects only', () => {
    const level = { layers: [{ type: 'objectgroup', objects: [{ id: 1, type: 'spawner', x: 0, y: 0, width: 10, height: 10 }, { id: 2, type: 'trigger', x: 0, y: 0, width: 4, height: 4 }] }] };
    expect(spawnerShapes(level).map((s) => (s.kind === 'cell' ? null : s.objectId))).toEqual([1]);
  });
});
