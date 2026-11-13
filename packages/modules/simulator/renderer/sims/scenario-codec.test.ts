import { describe, expect, it } from 'vitest';

import {
  base64ToBytes,
  bytesToBase64,
  decodeElementaryState,
  decodeLifeState,
  decodeNBodyState,
  encodeLifeState,
  decodeBoidsState,
  decodePredPreyState,
  parseBoidsParams,
  parseLifeParams,
  parsePredPreyParams,
  parseNBodyParams,
} from './scenario-codec';

describe('scenario codec', () => {
  it('round-trips bytes through base64, including a large buffer', () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
  });

  it('round-trips a life state through JSON', () => {
    const params = { width: 64, height: 64, rule: 'B3/S23', density: 0.3 };
    const cells = new Uint8Array(64 * 64).map((_, i) => (i % 3 === 0 ? 1 : 0));
    const json = JSON.parse(JSON.stringify(encodeLifeState({ width: 64, height: 64, cells, generation: 9 })));
    expect(decodeLifeState(json, params)).toEqual({ width: 64, height: 64, cells, generation: 9 });
  });

  it('rejects params and states that do not fit', () => {
    expect(parseLifeParams({ width: 64, height: 64, rule: 'nonsense', density: 0.3 })).toBeNull();
    expect(parseLifeParams({ width: 9999, height: 64, rule: 'B3/S23', density: 0.3 })).toBeNull();
    expect(parseNBodyParams({ bodies: 'x', G: 1, dt: 0.1, softening: 0 })).toBeNull();
    const params = { width: 64, height: 64, rule: 'B3/S23', density: 0.3 };
    expect(decodeLifeState({ width: 64, height: 64, cells: bytesToBase64(new Uint8Array(5)), generation: 0 }, params)).toBeNull();
    expect(decodeElementaryState({ rows: 'AAAA', row: 0, generation: 0 }, { rule: 30, width: 128, height: 64, start: 'single' })).toBeNull();
    expect(decodeNBodyState({ pos: [0], vel: [0], e0: 0, tick: 0 }, { bodies: [], G: 1, dt: 0.1, softening: 0 })).toBeNull();
  });

  it('checks boids and predator-prey params and states', () => {
    const boids = { count: 10, box: 100, separation: 1, alignment: 1, cohesion: 1, radius: 5, maxSpeed: 4 };
    expect(parseBoidsParams(boids)).toEqual(boids);
    expect(parseBoidsParams({ ...boids, count: 5 })).toBeNull();
    expect(parsePredPreyParams({ prey: 3, predators: 1, box: 10, preyBirth: 0.1, predatorBirth: 0.1, eatGain: 5 })).not.toBeNull();
    expect(parsePredPreyParams({ prey: -1 })).toBeNull();
    expect(decodeBoidsState({ pos: new Array(30).fill(0), vel: new Array(30).fill(0), tick: 1 }, boids)).not.toBeNull();
    expect(decodeBoidsState({ pos: [0], vel: [0], tick: 1 }, boids)).toBeNull();
    expect(decodePredPreyState({ agents: [1, 2], draws: 0, tick: 0 })).not.toBeNull();
    expect(decodePredPreyState({ agents: 'x' })).toBeNull();
  });
});
