import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

import { GamePlaytestResultSchema, GameReplaySchema, type GameSummary } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { encodePngRgba8 } from '../media/png/png-codec';
import { createPlaytests, type PlaytestPage } from './playtest';

/**
 * Theme O's play-test runner against a stand-in page that runs the kit's real
 * `kit/core/replay.js` (imported by URL, as `kit-core.test.ts` does): a game
 * whose player walks right while the `right` action is down. Page code is
 * evaluated in a `vm` context holding only `window` and `JSON`, the way
 * `executeJavaScript` sees the page.
 */

const coreDir = resolve(__dirname, '../../../../../templates/media-game/kit/core');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(coreDir, file)).href);

type FakeGame = { page: PlaytestPage; trace: string[]; color: { value: number } };

async function bootFakeGame(seed: number, color: { value: number }): Promise<FakeGame> {
  const { createReplayer } = await load('replay.js');
  const { createVirtualActions } = await load('input-map.js');
  const { createRng } = await load('rng.js');
  const actions = createVirtualActions();
  const rng = createRng(seed);
  const replayer = createReplayer({ actions, seed: () => seed, wait: () => Promise.resolve() });
  let x = 0;
  let frame = 0;
  let wobble = 0;
  const trace: string[] = [];
  const step = (n: number) => {
    for (let i = 0; i < n; i += 1) {
      replayer.beforeStep();
      frame += 1;
      if (actions.isDown('right')) x += 2;
      wobble = rng.int(0, 9); // seeded: the same seed gives the same wobble
      trace.push(`${frame}:${x}:${wobble}`);
    }
  };
  step(1); // the kit loop's first step, after which a play-test run is paused
  replayer.attach({ step, pause: () => undefined, resume: () => undefined });
  const window = {
    __midnite: {
      ready: true,
      getState: () => ({ version: 1, scene: 'level', frame, time: frame * 16, player: { position: [x, 0] }, wobble }),
      replay: {
        load: (r: unknown) => replayer.load(r),
        seek: (f: number) => replayer.seek(f),
        status: () => replayer.status(),
        record: () => replayer.record(),
        stop: () => replayer.stop(),
        play: (r: unknown, o: unknown) => replayer.play(r, o),
      },
    },
  };
  const page: PlaytestPage = {
    evaluate: async (code) => runInNewContext(code, { window, JSON }),
    capture: async () => {
      // 8×8: a column per 2 px walked, in `color`.
      const data = new Uint8Array(8 * 8 * 4);
      for (let i = 0; i < 64; i += 1) {
        const lit = i % 8 < Math.min(8, x / 20);
        data.set(lit ? [color.value, 40, 40, 255] : [0, 0, 0, 255], i * 4);
      }
      return encodePngRgba8(data, 8, 8);
    },
  };
  return { page, trace, color };
}

describe('play-tests (Theme O)', () => {
  let root: string;
  let current: FakeGame | null;
  let restarts: number[];
  const color = { value: 200 };
  const game = (): GameSummary => ({
    gameId: 'g1',
    name: 'Walker',
    path: root,
    engine: 'phaser',
    dimension: '2d',
    starter: 'top-down',
    dirty: false,
    valid: true,
    issue: null,
  });
  const playtests = () =>
    createPlaytests({
      resolve: async (target) => (target === 'g1' || target === root ? game() : null),
      runDeterministic: async (_gameId, seed) => {
        restarts.push(seed);
        current = await bootFakeGame(seed, color);
        return { ok: true };
      },
      page: () => current?.page ?? null,
      sleep: async () => undefined,
    });

  const smoke = {
    version: 1,
    name: 'smoke',
    replay: { version: 1, seed: 4, frames: 120, events: [{ f: 0, action: 'right', down: true }, { f: 60, action: 'right', down: false }] },
    asserts: [
      { frame: 120, kind: 'state', path: '$.scene', op: 'eq', value: 'level' },
      // The run starts paused after step 1, so the frame-0 press first moves the player on step 2.
      { frame: 30, kind: 'state', path: '$.player.position[0]', op: 'eq', value: 58 },
      { frame: 120, kind: 'state', path: '$.player.position[0]', op: 'eq', value: 118 },
    ],
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mstudio-playtest-'));
    await mkdir(join(root, 'playtests'), { recursive: true });
    current = null;
    restarts = [];
    color.value = 200;
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('runs a play-test from a deterministic restart, in frame order, and saves the result', async () => {
    await writeFile(join(root, 'playtests/smoke.json'), JSON.stringify(smoke));
    const result = await playtests().run('g1', { names: ['smoke'] });
    expect(restarts).toEqual([4]);
    expect(result.passed).toBe(true);
    expect(result.runs[0]?.results.map((r) => [r.assertIndex, r.status])).toEqual([
      [0, 'pass'],
      [1, 'pass'],
      [2, 'pass'],
    ]);
    const saved = GamePlaytestResultSchema.parse(JSON.parse(await readFile(join(root, 'playtests/results/smoke.json'), 'utf8')));
    expect(saved).toMatchObject({ name: 'smoke', passed: true, frames: 120 });
    const listed = await playtests().list('g1');
    expect(listed).toEqual([expect.objectContaining({ name: 'smoke', valid: true, issue: null, last: expect.objectContaining({ passed: true }) })]);
  });

  it('replays to an identical state trace twice', async () => {
    const runs = playtests();
    await runs.run('g1', { inline: smoke as never });
    const first = current!.trace;
    await runs.run('g1', { inline: smoke as never });
    expect(current!.trace).toEqual(first);
    expect(first.at(-1)).toMatch(/^120:118:/);
  });

  it('reports a failing state assertion with a screenshot, and a frame already passed as an error', async () => {
    const result = await playtests().run('g1', {
      inline: {
        ...smoke,
        asserts: [
          { frame: 60, kind: 'state', path: '$.player.position[0]', op: 'gt', value: 500 },
          { frame: 10, kind: 'state', path: '$.nope', op: 'exists' },
        ],
      } as never,
    });
    expect(result.passed).toBe(false);
    const [gt, missing] = result.runs[0]!.results;
    expect(gt).toMatchObject({ status: 'fail', ok: false, message: '$.player.position[0] is 118, expected > 500', screenshot: 'playtests/results/smoke-0.png' });
    expect(missing).toMatchObject({ status: 'fail', message: '$.nope does not exist' });
    expect(result.failures).toHaveLength(2);
    await expect(readFile(join(root, 'playtests/results/smoke-0.png'))).resolves.toBeInstanceOf(Buffer);
  });

  it('writes a missing frame baseline, then passes, then fails with a diff when the picture changes', async () => {
    const frameTest = { ...smoke, asserts: [{ frame: 120, kind: 'frame' }] } as never;
    const runs = playtests();
    const first = await runs.run('g1', { inline: frameTest });
    expect(first.runs[0]!.results[0]).toMatchObject({ status: 'baseline-created', ok: true });
    await expect(readFile(join(root, 'playtests/baselines/smoke@120.png'))).resolves.toBeInstanceOf(Buffer);
    expect((await runs.run('g1', { inline: frameTest })).runs[0]!.results[0]).toMatchObject({ status: 'pass', changedFraction: 0 });
    color.value = 90;
    const changed = await runs.run('g1', { inline: frameTest });
    expect(changed.runs[0]!.results[0]).toMatchObject({
      status: 'fail',
      ok: false,
      screenshot: 'playtests/results/smoke-0.png',
      diff: 'playtests/results/smoke-0-diff.png',
    });
    expect(changed.runs[0]!.results[0]!.changedFraction).toBeGreaterThan(0.01);
  });

  it('records a replay to playtests/replays and plays it back to the same state', async () => {
    const runs = playtests();
    expect(await runs.replayRecord('g1', { action: 'start', seed: 2 })).toEqual({ gameId: 'g1', recording: true, seed: 2 });
    // A "human" presses right for 20 steps through the page's virtual layer, as an input map would observe.
    const page = current!.page;
    await page.evaluate('window.__midnite.replay.seek(5)');
    const stopped = await runs.replayRecord('g1', { action: 'stop', name: 'walk' });
    expect(stopped).toMatchObject({ gameId: 'g1', recording: false, path: 'playtests/replays/walk.replay.json', frames: 5 });
    const saved = GameReplaySchema.parse(JSON.parse(await readFile(join(root, 'playtests/replays/walk.replay.json'), 'utf8')));
    expect(saved.seed).toBe(2);

    const played = await runs.replayPlay('g1', { replay: smoke.replay as never, speed: 'max' });
    expect(played).toMatchObject({ frames: 120, state: { frame: 120, player: { position: [118, 0] } } });
    await expect(runs.replayPlay('g1', { replay: '../outside.json', speed: 'max' })).rejects.toThrow('was not found');
  });

  it('asserts on the running game, refusing a frame that already passed', async () => {
    const runs = playtests();
    await runs.replayPlay('g1', { replay: smoke.replay as never, speed: 'max' });
    expect(await runs.assertState('g1', { frame: 120, path: '$.scene', op: 'eq', value: 'level' })).toMatchObject({ ok: true, status: 'pass' });
    expect(await runs.assertState('g1', { frame: 50, path: '$.scene', op: 'eq', value: 'level' })).toMatchObject({
      ok: false,
      status: 'error',
      message: 'Frame 50 has already passed (the game is at 120).',
    });
    const frame = await runs.assertFrame('g1', { frame: 130, name: 'end', tolerance: 0.01 });
    expect(frame).toMatchObject({ ok: true, status: 'baseline-created', baseline: 'playtests/baselines/end@130.png' });
  });

  it('lists invalid play-tests with the reason, and refuses a page that answers garbage', async () => {
    await writeFile(join(root, 'playtests/broken.json'), JSON.stringify({ version: 1, name: 'broken', replay: 'x', asserts: [] }));
    await writeFile(join(root, 'playtests/renamed.json'), JSON.stringify({ ...smoke }));
    const listed = await playtests().list('g1');
    expect(listed.map((e) => [e.name, e.valid])).toEqual([
      ['broken', false],
      ['renamed', false],
    ]);
    expect(listed[1]!.issue).toContain('the file is renamed.json');
    await expect(playtests().run('g1')).rejects.toThrow('This game has no play-tests');

    const hostile = createPlaytests({
      resolve: async () => game(),
      runDeterministic: async () => ({ ok: true }),
      page: () => ({ evaluate: async (code) => (code.includes('.load(') ? true : code.includes('status') ? 'not json' : 'ready'), capture: async () => Buffer.alloc(0) }),
      sleep: async () => undefined,
    });
    const result = await hostile.run('g1', { inline: smoke as never });
    expect(result.passed).toBe(false);
    expect(result.runs[0]!.results.map((r) => [r.status, r.message])).toEqual([
      ['error', 'replay.status() did not return valid JSON.'],
      ['error', 'replay.status() did not return valid JSON.'],
      ['error', 'replay.status() did not return valid JSON.'],
    ]);
  });
});
