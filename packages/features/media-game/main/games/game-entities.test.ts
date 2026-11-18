// @vitest-environment node
import { EVENT_CHANNELS, GAME_ENTITIES_MAX, GameEntitiesResultSchema, ok, type GameEntitiesResult, type GameRunStatePayload } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEntityPoller, readGameEntities } from './game-entities';

const snap = (id: number) => ({ id, type: 't', x: id, y: id, alive: true });

describe('readGameEntities', () => {
  it('reads scene, frame and entities from one evaluation', async () => {
    const evaluate = vi.fn(async () => JSON.stringify({ scene: 'cave', frame: 12, entities: [snap(1), snap(2)] }));
    const result = await readGameEntities(evaluate);
    expect(result).toEqual({ ok: true, value: { scene: 'cave', frame: 12, entities: [snap(1), snap(2)], truncated: false } });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('D1: caps at 500 and sets truncated, and the schema refuses more', async () => {
    const many = Array.from({ length: GAME_ENTITIES_MAX + 25 }, (_, i) => snap(i));
    const result = await readGameEntities(async () => JSON.stringify({ scene: 's', frame: 1, entities: many }));
    expect(result.ok && result.value.entities).toHaveLength(GAME_ENTITIES_MAX);
    expect(result.ok && result.value.truncated).toBe(true);
    expect(GameEntitiesResultSchema.safeParse({ scene: 's', frame: 1, entities: many, truncated: true }).success).toBe(false);
  });

  it('drops entries that are not snapshots (a hostile game cannot poison the list)', async () => {
    const result = await readGameEntities(async () => JSON.stringify({ scene: 's', frame: 1, entities: [snap(1), { id: 'x' }, null, { ...snap(3), x: 'far' }] }));
    expect(result.ok && result.value.entities).toEqual([snap(1)]);
  });

  it('D4: a kit without entities() (or without a hook) answers empty and unsupported', async () => {
    for (const raw of [JSON.stringify({ unsupported: true }), null]) {
      const result = await readGameEntities(async () => raw);
      expect(result).toEqual({ ok: true, value: { scene: '', frame: 0, entities: [], truncated: false, unsupported: true } });
    }
  });

  it('turns a throw, bad JSON and an oversized answer into the failure envelope', async () => {
    expect((await readGameEntities(async () => JSON.stringify({ __error: 'boom' }))).ok).toBe(false);
    expect((await readGameEntities(async () => '{nope')).ok).toBe(false);
    expect((await readGameEntities(async () => 'x'.repeat(600 * 1024))).ok).toBe(false);
    expect((await readGameEntities(async () => Promise.reject(new Error('gone')))).ok).toBe(false);
    expect((await readGameEntities(async () => 5)).ok).toBe(false);
  });
});

describe('createEntityPoller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const result: GameEntitiesResult = { scene: 's', frame: 1, entities: [snap(1)], truncated: false };
  const setup = (state: GameRunStatePayload['state'] | null = 'running') => {
    const current = { state };
    const read = vi.fn(async () => ok(result));
    const send = vi.fn();
    const poller = createEntityPoller({
      read,
      send,
      runState: (gameId) => (current.state === null ? null : { gameId, runId: 'r', state: current.state }),
    });
    return { current, read, send, poller };
  };

  it('D2: emits at 4 Hz while watched, and not at all with zero subscribers', async () => {
    const { read, send, poller } = setup();
    await vi.advanceTimersByTimeAsync(1000);
    expect(read).not.toHaveBeenCalled();
    poller.watch('g', 'a', true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(4);
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesEntityState, { gameId: 'g', result });
    poller.watch('g', 'a', false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('keeps polling until the last watcher leaves, and an unwatch twice is harmless', async () => {
    const { send, poller } = setup();
    poller.watch('g', 'a', true);
    poller.watch('g', 'b', true);
    poller.watch('g', 'a', false);
    poller.watch('g', 'a', false);
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(2);
    poller.watch('g', 'b', false);
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('skips ticks while paused (the last snapshot stays) and resumes', async () => {
    const { current, send, poller } = setup();
    poller.watch('g', 'a', true);
    await vi.advanceTimersByTimeAsync(250);
    current.state = 'paused';
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    current.state = 'running';
    await vi.advanceTimersByTimeAsync(250);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('stops on Stop: a stopped game ends its timer for good', async () => {
    const { current, read, send, poller } = setup();
    poller.watch('g', 'a', true);
    await vi.advanceTimersByTimeAsync(250);
    current.state = null;
    await vi.advanceTimersByTimeAsync(250);
    current.state = 'running';
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a slow read skips ticks instead of queueing a second one', async () => {
    let release: (() => void) | undefined;
    const read = vi.fn(() => new Promise<ReturnType<typeof ok<GameEntitiesResult>>>((resolve) => { release = () => resolve(ok(result)); }));
    const send = vi.fn();
    const poller = createEntityPoller({ read, send, runState: (gameId) => ({ gameId, runId: 'r', state: 'running' }) });
    poller.watch('g', 'a', true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(1);
    release?.();
    await vi.advanceTimersByTimeAsync(250);
    expect(send).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    poller.stopAll();
  });

  it('stopAll ends every timer', async () => {
    const { send, poller } = setup();
    poller.watch('g', 'a', true);
    poller.watch('h', 'a', true);
    poller.stopAll();
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).not.toHaveBeenCalled();
  });
});
