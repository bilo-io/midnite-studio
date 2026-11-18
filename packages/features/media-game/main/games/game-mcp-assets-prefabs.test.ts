import { describe, expect, it, vi } from 'vitest';

import { ok, prefabFromObjects, type GameSummary } from '@midnite/studio-shared';

import { createGameMcpTools, type GameMcpDeps } from './game-mcp';

// vitest: the assets / prefab / scatter tools over a fake service — nothing real is touched.
const game = { gameId: 'g1', path: '/games/g1', name: 'g1' } as GameSummary;
const map = (objects: unknown[] = []) => ({
  type: 'map',
  infinite: false,
  orientation: 'orthogonal',
  width: 40,
  height: 40,
  tilewidth: 16,
  tileheight: 16,
  nextobjectid: 10,
  tilesets: [],
  layers: [{ id: 1, name: 'Entities', type: 'objectgroup', objects }],
});
const asset = (name: string, kind: string) => ({ name, kind, path: `assets/${name}`, sha256: 'x', importedAt: '', source: { tab: 'model', repoId: null, path: name } });

function make() {
  const set = vi.fn(async (_g: string, _s: string, _l: unknown) => ok({ sha: 'sha1' }));
  const prefabSet = vi.fn(async (_g: string, _p: unknown) => ok({ sha: 'psha' }));
  const hut = prefabFromObjects('hut', '2d', [{ type: 'pickup', x: 10, y: 10 }, { type: 'pickup', x: 30, y: 10 }]);
  const service = {
    resolve: async () => game,
    manifestGet: async () => ({ manifest: { assets: [asset('tree.glb', 'model'), asset('boom.ogg', 'audio'), asset('walk.json', 'animation'), asset('hero.png', 'sprite')] }, issues: [] }),
    levels: {
      get: async () => ok({ level: map(), issues: [], images: [] }),
      set,
      prefabs: {
        list: async () => ok({ prefabs: [{ name: 'hut', dimension: '2d' as const, objects: 2 }] }),
        get: async (_g: string, name: string) => (name === 'hut' ? ok({ prefab: hut }) : { ok: false as const, kind: 'error' as const, message: 'nope' }),
        set: prefabSet,
      },
    },
    levelEditor: { request: async () => ok({ handled: false as const, reason: 'not-open' as const }) },
  };
  const tools = createGameMcpTools({ service: service as never, webContents: () => null } as GameMcpDeps);
  return { tools, set, prefabSet };
}

describe('game_assets_list', () => {
  it('I1: audio and animation are not placeable', async () => {
    const { assets } = await make().tools.game_assets_list({ game: 'g1' });
    expect(Object.fromEntries(assets.map((a) => [a.name, a.placeable]))).toEqual({ 'tree.glb': true, 'boom.ogg': false, 'walk.json': false, 'hero.png': true });
  });

  it('filters by kind', async () => {
    const { assets } = await make().tools.game_assets_list({ game: 'g1', kinds: ['audio'] });
    expect(assets.map((a) => a.name)).toEqual(['boom.ogg']);
  });
});

describe('prefab tools', () => {
  it('lists prefabs', async () => {
    expect(await make().tools.game_prefab_list({ game: 'g1' })).toEqual({ prefabs: [{ name: 'hut', dimension: '2d', objects: 2 }] });
  });

  it('saves a prefab from objects', async () => {
    const { tools, prefabSet } = make();
    expect(await tools.game_prefab_save({ game: 'g1', name: 'shed', dimension: '2d', objects: [{ type: 'pickup', x: 5, y: 5 }] })).toEqual({ sha: 'psha' });
    expect(prefabSet.mock.calls[0]?.[1]).toMatchObject({ name: 'shed', version: 1 });
  });
});

describe('game_level_scatter', () => {
  const input = {
    game: 'g1',
    scene: 'level',
    area: { x: 0, y: 0, width: 600, height: 600 },
    options: { sources: [{ kind: 'type' as const, type: 'pickup' }, { kind: 'prefab' as const, name: 'hut' }], radius: 100, density: 1, spacing: 30, seed: 42 },
    select: false,
  };

  it('I3: a seed gives the same added count twice on a fresh copy', async () => {
    const a = await make().tools.game_level_scatter(input);
    const b = await make().tools.game_level_scatter(input);
    expect(a.added.length).toBeGreaterThan(5);
    expect(b.added.length).toBe(a.added.length);
    expect(a).toMatchObject({ applied: 'file', saved: true });
  });

  it('refuses an area that is already full', async () => {
    const { tools } = make();
    await expect(tools.game_level_scatter({ ...input, area: { x: 0, y: 0, width: 5, height: 5 } })).rejects.toThrow(/Nothing to scatter/);
  });
});
