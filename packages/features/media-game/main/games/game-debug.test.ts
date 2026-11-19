// @vitest-environment node
import { GAME_NAV_VERTICES_MAX, GameNavMeshSchema } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { debugCode, GAME_NAV_MAX_BYTES, readGameNavMesh, setGameDebug } from './game-debug';

describe('debugCode / setGameDebug', () => {
  it('G1 splices only booleans into the exec string', () => {
    expect(debugCode({ colliders: true })).toContain('h.debug({"colliders":true})');
    expect(debugCode({ colliders: true, triggers: false, nav: true })).toContain('h.debug({"colliders":true,"triggers":false,"nav":true})');
    // A hostile value never reaches the page: anything that is not a boolean is dropped.
    expect(debugCode({ colliders: 'x"});alert(1);//' } as never)).toContain('h.debug({})');
  });

  it('answers the options now in force', async () => {
    const evaluate = vi.fn(async () => JSON.stringify({ colliders: true, triggers: false, nav: false }));
    expect(await setGameDebug(evaluate, { colliders: true })).toEqual({ ok: true, value: { colliders: true, triggers: false, nav: false } });
  });

  it('says to upgrade the kit when the game has no debug(), and fails soft on junk', async () => {
    const old = await setGameDebug(async () => null, { nav: true });
    expect(old.ok === false && old.kind === 'error' && old.message).toMatch(/Upgrade the kit/);
    expect((await setGameDebug(async () => '{nope', {})).ok).toBe(false);
    expect((await setGameDebug(async () => JSON.stringify({ colliders: 1 }), {})).ok).toBe(false);
    expect((await setGameDebug(async () => JSON.stringify({ __error: 'boom' }), {})).ok).toBe(false);
    expect((await setGameDebug(async () => Promise.reject(new Error('gone')), {})).ok).toBe(false);
  });
});

const triangle = [[0, 0], [1, 0], [1, 1]];

describe('readGameNavMesh', () => {
  it('reads polygons', async () => {
    const r = await readGameNavMesh(async () => JSON.stringify({ polygons: [triangle] }));
    expect(r).toEqual({ ok: true, value: { polygons: [triangle] } });
  });

  it('a game with no nav-mesh (or no hook) has no polygons', async () => {
    expect(await readGameNavMesh(async () => null)).toEqual({ ok: true, value: { polygons: [] } });
    expect(await readGameNavMesh(async () => JSON.stringify({ polygons: [] }))).toEqual({ ok: true, value: { polygons: [] } });
  });

  it('G3 refuses a 30,000-vertex mesh with a message, and the schema refuses it too', async () => {
    const polygons = Array.from({ length: 10_000 }, () => triangle);
    const r = await readGameNavMesh(async () => JSON.stringify({ polygons }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.kind === 'error' && r.message).toContain('30,000 vertices');
    expect(r.ok === false && r.kind === 'error' && r.message).toContain(String(GAME_NAV_VERTICES_MAX.toLocaleString('en-US')));
    expect(GameNavMeshSchema.safeParse({ polygons }).success).toBe(false);
    expect(GameNavMeshSchema.safeParse({ polygons: polygons.slice(0, 6000) }).success).toBe(true);
  });

  it('turns a throw, bad JSON, a bad shape and an oversized answer into the failure envelope', async () => {
    expect((await readGameNavMesh(async () => JSON.stringify({ __error: 'boom' }))).ok).toBe(false);
    expect((await readGameNavMesh(async () => '{nope')).ok).toBe(false);
    expect((await readGameNavMesh(async () => JSON.stringify({ polygons: [[[0, 'x'], [1, 1], [2, 2]]] }))).ok).toBe(false);
    expect((await readGameNavMesh(async () => JSON.stringify({ polygons: 'no' }))).ok).toBe(false);
    expect((await readGameNavMesh(async () => 'x'.repeat(GAME_NAV_MAX_BYTES + 1))).ok).toBe(false);
    expect((await readGameNavMesh(async () => 5)).ok).toBe(false);
    expect((await readGameNavMesh(async () => Promise.reject(new Error('gone')))).ok).toBe(false);
  });
});
