import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENT_CHANNELS, type LevelEditorRequest } from '@midnite/studio-shared';

import { createLevelEditorBridge, LEVEL_EDITOR_TIMEOUT_MESSAGE, LEVEL_EDITOR_TIMEOUT_MS } from './level-editor-bridge';

// vitest: the pending map, the timeout and presence. No timers or sockets are real.
const snapshot: LevelEditorRequest = { kind: 'snapshot', gameId: 'g1', scene: 'level' };

describe('createLevelEditorBridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const sent: Array<{ channel: string; payload: { id: string; request: LevelEditorRequest } }> = [];
    const bridge = createLevelEditorBridge({ send: (channel, payload) => sent.push({ channel, payload: payload as never }) });
    bridge.setOpen({ gameId: 'g1', scene: 'level' });
    return { bridge, sent };
  };

  it('C1: resolves with the renderer result, and with a failure after the timeout', async () => {
    const { bridge, sent } = make();
    const pending = bridge.request(snapshot);
    expect(sent[0]?.channel).toBe(EVENT_CHANNELS.gamesLevelEditorRequest);
    bridge.resolve(sent[0]!.payload.id, { handled: true, value: { level: {}, dirty: false } });
    expect(await pending).toEqual({ ok: true, value: { handled: true, value: { level: {}, dirty: false } } });

    const slow = bridge.request(snapshot);
    await vi.advanceTimersByTimeAsync(LEVEL_EDITOR_TIMEOUT_MS);
    expect(await slow).toEqual({ ok: false, kind: 'error', message: LEVEL_EDITOR_TIMEOUT_MESSAGE });
  });

  it('C2: an unknown id, a repeat and a late reply are dropped', async () => {
    const { bridge, sent } = make();
    bridge.resolve('nope', { handled: true, value: 1 });
    const pending = bridge.request(snapshot);
    const { id } = sent[0]!.payload;
    bridge.resolve(id, { handled: true, value: 1 });
    bridge.resolve(id, { handled: true, value: 2 });
    expect(await pending).toMatchObject({ ok: true, value: { value: 1 } });
    const late = bridge.request(snapshot);
    await vi.advanceTimersByTimeAsync(LEVEL_EDITOR_TIMEOUT_MS);
    await late;
    expect(() => bridge.resolve(sent[1]!.payload.id, { handled: true, value: 3 })).not.toThrow();
  });

  it('C7: answers not-open without sending when presence is another scene or null', async () => {
    const { bridge, sent } = make();
    bridge.setOpen({ gameId: 'g1', scene: 'other' });
    expect(await bridge.request(snapshot)).toEqual({ ok: true, value: { handled: false, reason: 'not-open' } });
    bridge.setOpen(null);
    expect(await bridge.request(snapshot)).toEqual({ ok: true, value: { handled: false, reason: 'not-open' } });
    expect(sent).toHaveLength(0);
  });

  it('passes a reply failure through as the failure envelope', async () => {
    const { bridge, sent } = make();
    const pending = bridge.request(snapshot);
    bridge.resolve(sent[0]!.payload.id, { ok: false, kind: 'error', message: 'boom' });
    expect(await pending).toEqual({ ok: false, kind: 'error', message: 'boom' });
  });

  it('honours a per-request timeout and a send that throws', async () => {
    const { bridge } = make();
    const quick = bridge.request(snapshot, { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    expect(await quick).toMatchObject({ ok: false });
    const broken = createLevelEditorBridge({
      send: () => {
        throw new Error('no window');
      },
    });
    broken.setOpen({ gameId: 'g1', scene: 'level' });
    expect(await broken.request(snapshot)).toMatchObject({ ok: false });
  });
});
