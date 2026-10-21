import { describe, expect, it } from 'vitest';

import { evaluateStateAssertion, parseJsonPath, readJsonPath } from './json-path';

describe('parseJsonPath', () => {
  it('parses keys, indices and quoted keys', () => {
    expect(parseJsonPath('$')).toEqual({ ok: true, segments: [] });
    expect(parseJsonPath('$.player.position[0]')).toEqual({ ok: true, segments: ['player', 'position', 0] });
    expect(parseJsonPath('$["odd key"][2].x')).toEqual({ ok: true, segments: ['odd key', 2, 'x'] });
  });

  it.each(['player', '$..x', '$[*]', '$[?(@.x)]', '$.a[', '$.', '$.a b', '$[-1]'])('refuses %s', (path) => {
    expect(parseJsonPath(path).ok).toBe(false);
  });
});

describe('readJsonPath', () => {
  const state = { player: { position: [3, 4] }, list: [{ id: 'a' }] };
  it('reads own values and reports missing ones', () => {
    expect(readJsonPath(state, ['player', 'position', 1])).toEqual({ found: true, value: 4 });
    expect(readJsonPath(state, ['list', 0, 'id'])).toEqual({ found: true, value: 'a' });
    expect(readJsonPath(state, ['player', 'position', 2])).toEqual({ found: false });
    expect(readJsonPath(state, ['nope'])).toEqual({ found: false });
  });
  it('never walks the prototype chain', () => {
    expect(readJsonPath(state, ['constructor'])).toEqual({ found: false });
    expect(readJsonPath(state, ['player', '__proto__'])).toEqual({ found: false });
  });
});

describe('evaluateStateAssertion', () => {
  const state = { scene: 'level', frame: 180, player: { position: [12.5, 3], health: 100 }, flags: { open: true } };
  it.each([
    [{ path: '$.scene', op: 'eq', value: 'level' }, true],
    [{ path: '$.scene', op: 'eq', value: 'menu' }, false],
    [{ path: '$.flags', op: 'eq', value: { open: true } }, true],
    [{ path: '$.scene', op: 'ne', value: 'menu' }, true],
    [{ path: '$.player.position[0]', op: 'gt', value: 10 }, true],
    [{ path: '$.player.position[0]', op: 'lt', value: 10 }, false],
    [{ path: '$.scene', op: 'gt', value: 1 }, false],
    [{ path: '$.player.health', op: 'exists' }, true],
    [{ path: '$.player.mana', op: 'exists' }, false],
    [{ path: '$.player.position[0]', op: 'approx', value: 12.4, epsilon: 0.2 }, true],
    [{ path: '$.player.position[0]', op: 'approx', value: 12 }, false],
    [{ path: '$.missing', op: 'eq', value: null }, false],
  ] as const)('%o → %s', (assertion, ok) => {
    expect(evaluateStateAssertion(state, assertion).ok).toBe(ok);
  });

  it('names the actual value on a failure', () => {
    expect(evaluateStateAssertion(state, { path: '$.frame', op: 'lt', value: 100 }).message).toBe('$.frame is 180, expected < 100');
  });
});
