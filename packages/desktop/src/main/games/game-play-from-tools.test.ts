import { GAMES_OFF_MESSAGE, type GameSummary } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGameMcpTools } from '@midnite/studio-feature-media-game/main';

import { dispatchMcpCall } from '../mcp/dispatch';
import { setGameTools } from '../mcp/game-tools';
import { resetMcpAllowUiStateForTests, setMcpAllowGamesState } from '../mcp/ui-gate';

/** Phase 140 Theme H: `game_play_from`, `game_entities` and `game_debug_overlay` through the real dispatcher. */

const GAME: GameSummary = {
  gameId: 'gabc', name: 'Demo', path: '/games/demo', engine: 'phaser', dimension: '2d', starter: 'blank',
  dirty: false, valid: true, issue: null, status: 'ok', findingCount: 0,
};

const level = (props: unknown[] = []) => ({
  type: 'map', orientation: 'orthogonal', infinite: false, width: 20, height: 10, tilewidth: 32, tileheight: 32, nextobjectid: 10,
  layers: [
    { id: 1, type: 'tilelayer', name: 'Ground', data: new Array(200).fill(0) },
    {
      id: 2, type: 'objectgroup', name: 'Objects',
      objects: [{ id: 9, name: 'Gem', type: 'pickup', x: 320, y: 160, width: 16, height: 16, rotation: 0, visible: true, properties: props.length ? [{ name: 'elevation', type: 'float', value: 2 }] : [] }],
    },
  ],
  tilesets: [], properties: props,
});
const LEVEL_3D = [{ name: 'midnite.dimension', type: 'string', value: '3d' }, { name: 'midnite.metresPerTile', type: 'float', value: 2 }];
const ENTITIES = {
  scene: 'level', frame: 7, truncated: false,
  entities: [
    { id: 1, type: 'coin', x: 1, y: 2, alive: true },
    { id: 2, type: 'enemy', x: 3, y: 4, alive: true },
    { id: 3, type: 'coin', x: 5, y: 6, alive: false },
  ],
};

function setup(opts: { editor?: { level: unknown; dirty: boolean } | null; file?: unknown; running?: boolean } = {}) {
  const preview = vi.fn(async () => ({ ok: true as const, value: { url: 'game://x', via: 'started' as const } }));
  const debug = vi.fn(async (_id: string, patch: object) => ({ ok: true as const, value: { colliders: false, triggers: false, nav: false, ...patch } }));
  const entitiesGet = vi.fn(async () => ({ ok: true as const, value: ENTITIES }));
  const get = vi.fn(async () => ({ ok: true as const, value: { level: opts.file ?? level(), issues: [] } }));
  const tools = createGameMcpTools({
    service: {
      resolve: async (target: string) => (target === GAME.gameId ? GAME : null),
      isRunning: () => opts.running ?? true,
      levels: { get, preview },
      entities: { get: entitiesGet },
      debug,
      levelEditor: {
        request: async () => (opts.editor ? { ok: true as const, value: { handled: true as const, value: { level: opts.editor.level, dirty: opts.editor.dirty } } } : { ok: true as const, value: { handled: false as const, reason: 'not-open' as const } }),
        resolve: () => undefined, setOpen: () => undefined, open: () => null,
      },
    } as never,
    webContents: () => null,
  });
  setGameTools(tools);
  return { preview, debug, get };
}

describe('game_play_from (Phase 140 Theme H)', () => {
  beforeEach(() => resetMcpAllowUiStateForTests());
  afterEach(() => setGameTools(null));

  it('H1: objectId starts at that object (2D centre, px) and plays the editor level', async () => {
    setMcpAllowGamesState(true);
    const edited = level();
    const { preview } = setup({ editor: { level: edited, dirty: true } });
    const result = await dispatchMcpCall('game_play_from', { game: 'gabc', scene: 'level', objectId: 9 });
    expect(result).toEqual({ ok: true, value: { url: 'game://x', via: 'started', source: 'editor' } });
    expect(preview).toHaveBeenCalledWith({ gameId: 'gabc', scene: 'level', level: edited, spawn: { x: 328, y: 168 } });
  });

  it('H1: a 3D object starts in metres, with its elevation as the height', async () => {
    setMcpAllowGamesState(true);
    const { preview } = setup({ file: level(LEVEL_3D) });
    await dispatchMcpCall('game_play_from', { game: 'gabc', scene: 'level', objectId: 9, useEditor: false });
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ spawn: { x: 20.5, y: 2, z: 10.5 } }));
  });

  it('converts at in m to px for a 2D level and answers source file without an editor', async () => {
    setMcpAllowGamesState(true);
    const { preview } = setup({ editor: null });
    const result = await dispatchMcpCall('game_play_from', { game: 'gabc', scene: 'level', at: { x: 2, y: 3 }, unit: 'm' });
    expect(result).toMatchObject({ ok: true, value: { source: 'file' } });
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ spawn: { x: 64, y: 96 } }));
  });

  it('useEditor false ignores the open editor; no start point passes null', async () => {
    setMcpAllowGamesState(true);
    const { preview, get } = setup({ editor: { level: level(), dirty: true } });
    const result = await dispatchMcpCall('game_play_from', { game: 'gabc', scene: 'level', useEditor: false });
    expect(result).toMatchObject({ ok: true, value: { source: 'file' } });
    expect(get).toHaveBeenCalled();
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ spawn: null }));
  });

  it('an unknown objectId is not-found and starts nothing', async () => {
    setMcpAllowGamesState(true);
    const { preview } = setup();
    expect(await dispatchMcpCall('game_play_from', { game: 'gabc', scene: 'level', objectId: 404 })).toMatchObject({ ok: false, kind: 'not-found' });
    expect(preview).not.toHaveBeenCalled();
  });
});

describe('game_entities / game_debug_overlay (Phase 140 Theme H)', () => {
  beforeEach(() => resetMcpAllowUiStateForTests());
  afterEach(() => setGameTools(null));

  it('H2: game_entities works with the switch off, filters by type and caps at limit', async () => {
    setup();
    const all = await dispatchMcpCall('game_entities', { game: 'gabc' });
    expect(all).toMatchObject({ ok: true, value: { frame: 7, truncated: false } });
    const coins = await dispatchMcpCall('game_entities', { game: 'gabc', types: ['coin'], limit: 1 });
    expect(coins).toMatchObject({ ok: true, value: { truncated: true } });
    if (coins.ok) expect((coins.value as { entities: unknown[] }).entities).toHaveLength(1);
  });

  it('game_entities asks to run the game first when it is not running', async () => {
    setup({ running: false });
    expect(await dispatchMcpCall('game_entities', { game: 'gabc' })).toMatchObject({ ok: false, message: 'Run the game first.' });
  });

  it('H2: play_from and debug_overlay refuse while the switch is off', async () => {
    setup();
    expect(await dispatchMcpCall('game_play_from', { game: 'gabc', scene: 'level' })).toMatchObject({ ok: false, kind: 'refused', message: GAMES_OFF_MESSAGE });
    expect(await dispatchMcpCall('game_debug_overlay', { game: 'gabc', nav: true })).toMatchObject({ ok: false, kind: 'refused' });
  });

  it('game_debug_overlay passes only the switches given and answers what is applied', async () => {
    setMcpAllowGamesState(true);
    const { debug } = setup();
    const result = await dispatchMcpCall('game_debug_overlay', { game: 'gabc', colliders: true });
    expect(result).toEqual({ ok: true, value: { applied: { colliders: true, triggers: false, nav: false } } });
    expect(debug).toHaveBeenCalledWith('gabc', { colliders: true });
  });
});
