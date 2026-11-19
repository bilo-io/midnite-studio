import { describe, expect, it } from 'vitest';

import { GAME_LEVEL_ENTITY_TYPES_2D, GAME_LEVEL_ENTITY_TYPES_3D, GAME_LEVEL_PROPS, levelEnvironment } from './game-level';
import { spawnerLabel, spawnerShapes } from './game-level-overlays';

const props = (...p: Array<[string, unknown]>) => ({ properties: p.map(([name, value]) => ({ name, value })) });

describe('levelEnvironment', () => {
  it('defaults: auto weather, no clock, scale 1', () => {
    expect(levelEnvironment({})).toEqual({ weather: 'auto', weatherOptions: ['auto'], timeOfDay: null, timeScale: 1 });
  });
  it('reads the properties, with auto first in the options and no duplicates', () => {
    const e = levelEnvironment(props([GAME_LEVEL_PROPS.weather, 'rain'], [GAME_LEVEL_PROPS.weatherOptions, 'clear, rain,auto,rain,fog'], [GAME_LEVEL_PROPS.timeOfDay, 18.5], [GAME_LEVEL_PROPS.timeScale, 0]));
    expect(e).toEqual({ weather: 'rain', weatherOptions: ['auto', 'clear', 'rain', 'fog'], timeOfDay: 18.5, timeScale: 0 });
  });
  it('clamps time of day and treats wrong types as absent', () => {
    expect(levelEnvironment(props([GAME_LEVEL_PROPS.timeOfDay, 99])).timeOfDay).toBe(24);
    expect(levelEnvironment(props([GAME_LEVEL_PROPS.timeOfDay, -3])).timeOfDay).toBe(0);
    expect(levelEnvironment(props([GAME_LEVEL_PROPS.timeOfDay, '12'], [GAME_LEVEL_PROPS.timeScale, -2], [GAME_LEVEL_PROPS.weather, 4]))).toMatchObject({ timeOfDay: null, timeScale: 0, weather: 'auto' });
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
