import { EVENT_CHANNELS, GAMES_OFF_MESSAGE, MCP_TOOLS, type GameLogEntry, type GameSummary } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchMcpCall } from '../mcp/dispatch';
import { setGameTools } from '../mcp/game-tools';
import { resetMcpAllowUiStateForTests, setMcpAllowGamesState } from '../mcp/ui-gate';
import { createGameMcpTools, toInputEvent, type GameImage, type GameWebContents } from './game-mcp';

/** vitest: the game_* tools through the real dispatcher, with a fake service and a fake `webContents`. */

const GAME: GameSummary = {
  gameId: 'gabc',
  name: 'Demo',
  path: '/games/demo',
  engine: 'phaser',
  dimension: '2d',
  starter: 'blank',
  dirty: false,
  valid: true,
  issue: null,
};

function fakeImage(width = 800, height = 600): GameImage {
  return {
    getSize: () => ({ width, height }),
    resize: ({ width: w, height: h }) => fakeImage(w, h),
    toPNG: () => Buffer.from(`png-${width}x${height}`),
  };
}

function fakeWebContents(executeJavaScript: GameWebContents['executeJavaScript'] = async () => 'null'): GameWebContents & {
  sent: Array<Parameters<GameWebContents['sendInputEvent']>[0]>;
} {
  const sent: Array<Parameters<GameWebContents['sendInputEvent']>[0]> = [];
  return {
    sent,
    capturePage: vi.fn(async () => fakeImage()),
    sendInputEvent: (event) => void sent.push(event),
    executeJavaScript: vi.fn(executeJavaScript),
    focus: vi.fn(),
  };
}

function setup(wc: GameWebContents | null, opts: { logs?: GameLogEntry[]; manifest?: Record<string, unknown> } = {}) {
  const emitted: Array<[string, unknown]> = [];
  const manifestSet = vi.fn(async () => ({ ok: true as const }));
  const tools = createGameMcpTools({
    service: {
      resolve: async (target) => (target === GAME.gameId || target === GAME.path ? GAME : null),
      list: async () => [GAME],
      create: async () => ({ ok: true as const, value: { path: '/games/new', gameId: 'gnew' } }),
      manifestGet: async () => ({ manifest: (opts.manifest ?? { kitVersion: '0.1.0', vendored: { phaser: '3.80.1' } }) as never, issues: [] }),
      manifestSet,
      run: async () => ({ ok: true as const, value: { runId: 'r1' } }),
      stop: () => ({ ok: true as const }),
      reload: () => ({ ok: true as const }),
      logs: (_id, since = 0) => ({ runId: 'r1', entries: (opts.logs ?? []).filter((entry) => entry.seq > since) }),
      emit: (channel, payload) => void emitted.push([channel, payload]),
      isRunning: () => wc !== null,
    },
    webContents: () => wc,
  });
  setGameTools(tools);
  return { emitted, manifestSet };
}

const entry = (seq: number, level: GameLogEntry['level'] = 'log'): GameLogEntry => ({ seq, at: seq, level, text: `line ${seq}` });

describe('game_* over the global MCP dispatcher', () => {
  beforeEach(() => resetMcpAllowUiStateForTests());
  afterEach(() => {
    setGameTools(null);
    vi.useRealTimers();
  });

  it('registers every tool with an input that rejects a missing game', () => {
    for (const id of ['game_open', 'game_run', 'game_state', 'game_screenshot']) {
      expect(MCP_TOOLS[id as 'game_open'].input.safeParse({}).success, id).toBe(false);
    }
  });

  it('refuses every write tool with the named reason while the switch is off, touching nothing', async () => {
    const wc = fakeWebContents();
    const { manifestSet, emitted } = setup(wc);
    for (const [tool, input] of [
      ['game_create', { name: 'X', engine: 'phaser', perspective: 'top-down' }],
      ['game_open', { game: 'gabc' }],
      ['game_set_manifest', { game: 'gabc', patch: { network: 'on' } }],
      ['game_run', { game: 'gabc' }],
      ['game_stop', { game: 'gabc' }],
      ['game_reload', { game: 'gabc' }],
      ['game_input', { game: 'gabc', events: [{ t: 0, type: 'keyDown', key: 'a' }] }],
    ] as const) {
      expect(await dispatchMcpCall(tool, input), tool).toEqual({ ok: false, kind: 'refused', message: GAMES_OFF_MESSAGE });
    }
    expect(manifestSet).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
    expect(wc.sent).toEqual([]);
  });

  it('answers the read tools with the switch off', async () => {
    setup(fakeWebContents(), { logs: [entry(1), entry(2)] });
    expect(await dispatchMcpCall('game_list', {})).toMatchObject({ ok: true, value: { games: [{ gameId: 'gabc' }] } });
    expect(await dispatchMcpCall('game_get_manifest', { game: 'gabc' })).toMatchObject({ ok: true });
    expect(await dispatchMcpCall('game_logs', { game: 'gabc' })).toMatchObject({ ok: true, value: { next: 2 } });
  });

  it('runs, reloads and stops with the switch on, and opens through the window event', async () => {
    setMcpAllowGamesState(true);
    const { emitted } = setup(fakeWebContents());
    expect(await dispatchMcpCall('game_run', { game: 'gabc' })).toEqual({ ok: true, value: { gameId: 'gabc', runId: 'r1' } });
    expect(await dispatchMcpCall('game_reload', { game: '/games/demo' })).toMatchObject({ ok: true });
    expect(await dispatchMcpCall('game_stop', { game: 'gabc' })).toMatchObject({ ok: true });
    expect(await dispatchMcpCall('game_open', { game: 'gabc' })).toMatchObject({ ok: true, value: { opened: true } });
    expect(emitted).toEqual([[EVENT_CHANNELS.gamesOpen, { gameId: 'gabc' }]]);
  });

  it('refuses a path that is not a game, and an unknown id, as not-found', async () => {
    setMcpAllowGamesState(true);
    setup(fakeWebContents());
    expect(await dispatchMcpCall('game_run', { game: '/etc' })).toEqual({ ok: false, kind: 'not-found', message: 'That folder is not a Midnite game.' });
    expect(await dispatchMcpCall('game_run', { game: 'gnope' })).toMatchObject({ ok: false, kind: 'not-found' });
  });

  it('game_set_manifest merges a patch but refuses to change vendored or kitVersion', async () => {
    setMcpAllowGamesState(true);
    const { manifestSet } = setup(fakeWebContents());
    expect(await dispatchMcpCall('game_set_manifest', { game: 'gabc', patch: { vendored: { phaser: '9.9.9' } } })).toMatchObject({
      ok: false,
      kind: 'refused',
      message: expect.stringContaining('vendored'),
    });
    expect(await dispatchMcpCall('game_set_manifest', { game: 'gabc', patch: { kitVersion: '9.0.0' } })).toMatchObject({ ok: false, kind: 'refused' });
    expect(manifestSet).not.toHaveBeenCalled();
    // An unchanged value is not a change.
    expect(await dispatchMcpCall('game_set_manifest', { game: 'gabc', patch: { kitVersion: '0.1.0', network: 'on' } })).toMatchObject({ ok: true });
    expect(manifestSet).toHaveBeenCalledWith('gabc', { kitVersion: '0.1.0', network: 'on' });
  });

  it('game_screenshot needs a running game, downscales, and returns PNG blocks', async () => {
    setup(null);
    expect(await dispatchMcpCall('game_screenshot', { game: 'gabc' })).toEqual({ ok: false, kind: 'error', message: 'Run the game first.' });
    const wc = fakeWebContents();
    setup(wc);
    vi.useFakeTimers();
    const pending = dispatchMcpCall('game_screenshot', { game: 'gabc', count: 2, intervalMs: 100, scale: 0.5 });
    await vi.advanceTimersByTimeAsync(100);
    const result = (await pending) as { ok: true; value: { _content: Array<{ type: string; data?: string; mimeType?: string }> } };
    const images = result.value._content.filter((block) => block.type === 'image');
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ mimeType: 'image/png', data: Buffer.from('png-400x300').toString('base64') });
    expect(wc.capturePage).toHaveBeenCalledTimes(2);
  });

  it('game_logs filters by level and advances the cursor only past what it returned', async () => {
    setup(fakeWebContents(), { logs: [entry(1), entry(2, 'error'), entry(3), entry(4, 'error')] });
    expect(await dispatchMcpCall('game_logs', { game: 'gabc', levels: ['error'] })).toMatchObject({
      value: { entries: [{ seq: 2 }, { seq: 4 }], next: 4 },
    });
    expect(await dispatchMcpCall('game_logs', { game: 'gabc', limit: 2 })).toMatchObject({ value: { entries: [{ seq: 1 }, { seq: 2 }], next: 2 } });
    expect(await dispatchMcpCall('game_logs', { game: 'gabc', since: 4 })).toMatchObject({ value: { entries: [], next: 4 } });
  });

  describe('game_state treats the page as hostile', () => {
    const state = async (answer: unknown) => {
      setup(fakeWebContents(async () => answer));
      return dispatchMcpCall('game_state', { game: 'gabc' });
    };

    it('returns a valid object as data', async () => {
      expect(await state(JSON.stringify({ score: 3, entities: [{ x: 1 }] }))).toEqual({ ok: true, value: { state: { score: 3, entities: [{ x: 1 }] } } });
      // Theme E: the kit's common keys are typed when present.
      expect(await state(JSON.stringify({ version: 1, scene: 'level-1', frame: 4, time: 66, player: { position: [1, 2] } }))).toMatchObject({ ok: true });
      expect(await state(JSON.stringify({ player: { position: ['x', 2] } }))).toMatchObject({
        ok: false,
        message: expect.stringContaining('getState() returned a bad player.position.0'),
      });
    });

    it('bounds a 300 KB answer', async () => {
      expect(await state(JSON.stringify({ big: 'x'.repeat(300 * 1024) }))).toEqual({
        ok: false,
        kind: 'error',
        message: 'getState() returned more than 256 KB.',
      });
    });

    it('turns a thrown or cyclic getState into a bounded error', async () => {
      const result = await state(JSON.stringify({ __error: `TypeError: ${'cyclic '.repeat(200)}` }));
      expect(result).toMatchObject({ ok: false, kind: 'error' });
      expect((result as { message: string }).message.length).toBeLessThanOrEqual(330);
    });

    it('rejects non-JSON, non-string and non-object answers', async () => {
      expect(await state('not json')).toMatchObject({ ok: false, message: 'getState() did not return valid JSON.' });
      expect(await state({ evil: 'object' })).toMatchObject({ ok: false, message: 'getState() did not return JSON.' });
      expect(await state('[1,2]')).toMatchObject({ ok: false, message: 'getState() must return an object.' });
      expect(await state('null')).toMatchObject({ ok: false, message: expect.stringContaining('no state hook') });
    });

    it('rejects a 40-deep object', async () => {
      let deep: unknown = 1;
      for (let i = 0; i < 40; i += 1) deep = { d: deep };
      expect(await state(JSON.stringify(deep))).toMatchObject({ ok: false, message: expect.stringContaining('deeper than 32') });
    });

    it('gives up on a getState that never answers', async () => {
      setup(fakeWebContents(() => new Promise(() => undefined)));
      vi.useFakeTimers();
      const pending = dispatchMcpCall('game_state', { game: 'gabc' });
      await vi.advanceTimersByTimeAsync(2100);
      expect(await pending).toMatchObject({ ok: false, message: 'getState() did not answer within 2 s.' });
    });
  });

  describe('game_input', () => {
    it('sends a keyDown/keyUp pair as two ordered sendInputEvent calls at their offsets', async () => {
      setMcpAllowGamesState(true);
      const wc = fakeWebContents();
      setup(wc);
      vi.useFakeTimers();
      const pending = dispatchMcpCall('game_input', {
        game: 'gabc',
        // Out of order on purpose: the call orders by `t`.
        events: [
          { t: 50, type: 'keyUp', key: 'ArrowLeft' },
          { t: 0, type: 'keyDown', key: 'ArrowLeft' },
        ],
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(wc.sent).toEqual([{ type: 'keyDown', keyCode: 'ArrowLeft' }]);
      await vi.advanceTimersByTimeAsync(50);
      expect(wc.sent).toEqual([
        { type: 'keyDown', keyCode: 'ArrowLeft' },
        { type: 'keyUp', keyCode: 'ArrowLeft' },
      ]);
      await vi.advanceTimersByTimeAsync(100);
      expect(await pending).toEqual({ ok: true, value: { sent: 2 } });
      expect(wc.focus).toHaveBeenCalled();
    });

    it('maps pointer events, and refuses gamepad events on a game without the hook', async () => {
      expect(toInputEvent({ t: 0, type: 'mouseDown', x: 10.4, y: 20.6, button: 'right' })).toEqual({
        type: 'mouseDown',
        x: 10,
        y: 21,
        button: 'right',
        clickCount: 1,
      });
      expect(toInputEvent({ t: 0, type: 'keyDown', key: ' ' })).toEqual({ type: 'keyDown', keyCode: 'Space' });
      expect(toInputEvent({ t: 0, type: 'gamepad', button: 0, pressed: true })).toBeNull();

      setMcpAllowGamesState(true);
      const wc = fakeWebContents(async () => false);
      setup(wc);
      const result = await dispatchMcpCall('game_input', { game: 'gabc', events: [{ t: 0, type: 'gamepad', button: 0, pressed: true }] });
      expect(result).toMatchObject({ ok: false, kind: 'error', message: expect.stringContaining('no gamepad hook') });
      expect(wc.sent).toEqual([]);
    });

    it('delivers a gamepad event through the kit hook when it exists', async () => {
      setMcpAllowGamesState(true);
      const calls: string[] = [];
      const wc = fakeWebContents(async (code) => {
        calls.push(code);
        return true;
      });
      setup(wc);
      vi.useFakeTimers();
      const pending = dispatchMcpCall('game_input', { game: 'gabc', events: [{ t: 0, type: 'gamepad', button: 3, pressed: true }] });
      await vi.advanceTimersByTimeAsync(200);
      expect(await pending).toEqual({ ok: true, value: { sent: 1 } });
      expect(calls.at(-1)).toBe('window.__midnite.input.gamepad(3, true)');
    });
  });
});
