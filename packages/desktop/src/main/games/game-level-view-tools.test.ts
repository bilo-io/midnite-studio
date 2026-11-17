import { GAMES_OFF_MESSAGE, type GameSummary, type LevelEditorRequest } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGameMcpTools } from '@midnite/studio-feature-media-game/main';

import { dispatchMcpCall } from '../mcp/dispatch';
import { setGameTools } from '../mcp/game-tools';
import { resetMcpAllowUiStateForTests, setMcpAllowGamesState } from '../mcp/ui-gate';

/** Phase 138 Themes G and H: `game_level_select`, `game_level_frame` and `game_level_view` through the real dispatcher. */

const GAME: GameSummary = {
  gameId: 'gabc', name: 'Demo', path: '/games/demo', engine: 'phaser', dimension: '2d', starter: 'blank',
  dirty: false, valid: true, issue: null, status: 'ok', findingCount: 0,
};

type Answer = Awaited<ReturnType<Parameters<typeof createGameMcpTools>[0]['service']['levelEditor']['request']>>;
const handled = (value: unknown): Answer => ({ ok: true, value: { handled: true, value } });
const NOT_OPEN: Answer = { ok: true, value: { handled: false, reason: 'not-open' } };

function setup(answer: (req: LevelEditorRequest, opts?: { timeoutMs?: number }) => Answer) {
  const request = vi.fn(async (req: LevelEditorRequest, opts?: { timeoutMs?: number }) => answer(req, opts));
  const tools = createGameMcpTools({
    service: {
      resolve: async (target: string) => (target === GAME.gameId ? GAME : null),
      levelEditor: { request, resolve: () => undefined, setOpen: () => undefined, open: () => null },
    } as never,
    webContents: () => null,
  });
  setGameTools(tools);
  return request;
}

const OPEN_FIRST = 'Open level in Media ▸ Games ▸ Level editor first.';

describe('game_level_select / game_level_frame (Phase 138 Theme G)', () => {
  beforeEach(() => resetMcpAllowUiStateForTests());
  afterEach(() => setGameTools(null));

  it('G3: both refuse while the games switch is off', async () => {
    setup(() => NOT_OPEN);
    expect(await dispatchMcpCall('game_level_select', { game: 'gabc', scene: 'level', ids: [1] })).toMatchObject({ ok: false, kind: 'refused', message: GAMES_OFF_MESSAGE });
    expect(await dispatchMcpCall('game_level_frame', { game: 'gabc', scene: 'level' })).toMatchObject({ ok: false, kind: 'refused' });
  });

  it('G3: both fail with the Open-first message when the scene is not open, or the editor times out', async () => {
    setMcpAllowGamesState(true);
    setup(() => NOT_OPEN);
    expect(await dispatchMcpCall('game_level_select', { game: 'gabc', scene: 'level', ids: [1] })).toMatchObject({ ok: false, message: OPEN_FIRST });
    setup(() => ({ ok: false, kind: 'error', message: 'the level editor did not answer' }));
    expect(await dispatchMcpCall('game_level_frame', { game: 'gabc', scene: 'level' })).toMatchObject({ ok: false, message: OPEN_FIRST });
  });

  it('G1: select forwards the ids and frame flag and answers selected / missing', async () => {
    setMcpAllowGamesState(true);
    const request = setup(() => handled({ selected: [3], missing: [999] }));
    const result = await dispatchMcpCall('game_level_select', { game: 'gabc', scene: 'level', ids: [3, 999] });
    expect(result).toEqual({ ok: true, value: { selected: [3], missing: [999] } });
    expect(request).toHaveBeenCalledWith({ kind: 'select', gameId: 'gabc', scene: 'level', ids: [3, 999], frame: true }, undefined);
  });

  it('frame forwards a region and answers the view it framed', async () => {
    setMcpAllowGamesState(true);
    const request = setup(() => handled({ view: 'plan' }));
    const region = { x: 0, y: 0, width: 64, height: 64 };
    expect(await dispatchMcpCall('game_level_frame', { game: 'gabc', scene: 'level', region })).toEqual({ ok: true, value: { framed: true, view: 'plan' } });
    expect(request).toHaveBeenCalledWith({ kind: 'frame', gameId: 'gabc', scene: 'level', region }, undefined);
  });
});

describe('game_level_view (Phase 138 Theme H)', () => {
  beforeEach(() => resetMcpAllowUiStateForTests());
  afterEach(() => setGameTools(null));

  const seen = (png: string, w = 960, h = 600) => handled({ png, view: '3d', width: w, height: h, camera: null, objects: 4 });

  it('H2: answers a text block then an image/png block, with the switch off, on the long timeout', async () => {
    const request = setup(() => seen('AAAA'));
    const result = await dispatchMcpCall('game_level_view', { game: 'gabc', scene: 'level', preset: 'iso' });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    const blocks = (result.value as { _content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> })._content;
    expect(blocks[0]!.type).toBe('text');
    expect(JSON.parse(blocks[0]!.text!)).toMatchObject({ view: '3d', objects: 4 });
    expect(blocks[1]).toEqual({ type: 'image', data: 'AAAA', mimeType: 'image/png' });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ kind: 'view', preset: 'iso', view: 'current', width: 960, height: 600 }), { timeoutMs: 15_000 });
  });

  it('H4: an over-cap PNG is asked for again at half the size', async () => {
    const big = 'A'.repeat(4 * 1024 * 1024);
    const request = setup((req) => (req.kind === 'view' && req.width > 480 ? seen(big, req.width, req.height) : seen('BBBB', 480, 300)));
    const result = await dispatchMcpCall('game_level_view', { game: 'gabc', scene: 'level' });
    expect(result).toMatchObject({ ok: true });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]![0]).toMatchObject({ width: 480, height: 300 });
  });

  it('fails with the Open-first message when the scene is not open', async () => {
    setup(() => NOT_OPEN);
    expect(await dispatchMcpCall('game_level_view', { game: 'gabc', scene: 'level' })).toMatchObject({ ok: false, message: OPEN_FIRST });
  });
});
