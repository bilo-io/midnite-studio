// @vitest-environment node
// vitest, not Playwright: the loop's wiring over a fake runtime — no page, no browser.
import { describe, expect, it, vi } from 'vitest';

import type { GameSummary } from '@midnite/studio-shared';

import type { GameView } from './game-electron';
import { createGameLoop, type GameLoopDeps } from './game-loop';
import type { GamePageContents } from './game-mcp';

const GAME = { gameId: 'gabc', path: '/games/a', name: 'A', valid: true } as unknown as GameSummary;

function setup(options: { running?: boolean; destroyed?: boolean } = {}) {
  const view = { webContents: {} } as unknown as GameView;
  const contents: GamePageContents & { isDestroyed(): boolean } = {
    capturePage: async () => ({ getSize: () => ({ width: 1, height: 1 }), resize: () => undefined as never, toPNG: () => Buffer.from('png') }),
    sendInputEvent: vi.fn(),
    executeJavaScript: vi.fn(async () => '"ok"'),
    focus: vi.fn(),
    isDestroyed: () => options.destroyed === true,
  };
  const run = vi.fn(async () => ({ ok: true as const, value: { runId: 'r1' } }));
  const runtime = {
    runner: { view: () => (options.running === false ? null : view) },
    service: { resolve: async () => GAME, run, toolbar: vi.fn(async () => ({ ok: true })) },
    assets: { importAsset: vi.fn() },
  } as unknown as GameLoopDeps['runtime'];
  const loop = createGameLoop({ runtime, contents: (v) => (v === view ? contents : null) });
  return { loop, contents, run };
}

describe('createGameLoop', () => {
  it('answers the tools from the running view’s contents', async () => {
    const { loop, contents } = setup();
    await expect(loop.tools.game_state({ game: 'gabc' })).rejects.toThrow();
    expect(contents.executeJavaScript).toHaveBeenCalled();
  });

  it('refuses a tool that needs the page while the game is not running', async () => {
    const { loop } = setup({ running: false });
    await expect(loop.tools.game_state({ game: 'gabc' })).rejects.toThrow('Run the game first.');
  });

  it('restarts a play-test deterministically and treats a destroyed page as not running', async () => {
    const { loop, run } = setup({ destroyed: true });
    const recorded = loop.playtests.replayRecord('gabc', { action: 'start', seed: 7 });
    await expect(recorded).rejects.toThrow('The game stopped before it was ready.');
    expect(run).toHaveBeenCalledWith('gabc', { determinism: { seed: 7, paused: true } });
  });
});
