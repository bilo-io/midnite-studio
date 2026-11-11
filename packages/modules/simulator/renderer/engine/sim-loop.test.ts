import { describe, expect, it } from 'vitest';

import { createSimLoop, MAX_TICKS_PER_INTERVAL } from './sim-loop';
import type { SimEngine, SimOut } from './types';

/** Counts ticks; its one float is the count. */
function counter(): SimEngine<unknown, number> {
  let n = 0;
  return {
    capacity: 1,
    init: () => void (n = 0),
    step: () => void (n += 1),
    snapshot: (out) => {
      out[0] = n;
      return 1;
    },
    stats: () => ({ n }),
    serialise: () => n,
    restore: (s) => void (n = s),
  };
}

function rig() {
  const out: { msg: SimOut; transfer?: ArrayBuffer[] }[] = [];
  let tickFn: (() => void) | null = null;
  let clock = 0;
  const loop = createSimLoop({
    engines: { life: counter as never },
    post: (msg, transfer) => out.push({ msg, transfer }),
    now: () => clock,
    every: (fn) => {
      tickFn = fn;
      return () => void (tickFn = null);
    },
  });
  const frames = () => out.filter((o) => o.msg.type === 'frame');
  return { loop, out, frames, /** One on-time 60 Hz interval, or `late` ms of it. */
    interval: (ms = 1000 / 60) => {
      clock += ms;
      tickFn?.();
    }, running: () => tickFn !== null };
}

const init = { type: 'init', kind: 'life', params: {}, seed: 1 } as const;

describe('sim loop', () => {
  it('posts a first frame on init, transferring the buffer', () => {
    const r = rig();
    r.loop.handle(init);
    expect(r.frames()).toHaveLength(1);
    expect(r.frames()[0]!.transfer).toHaveLength(1);
  });

  it('answers an unknown kind with an error, not a throw', () => {
    const r = rig();
    r.loop.handle({ type: 'init', kind: 'nbody', params: {}, seed: 1 });
    expect(r.out[0]!.msg.type).toBe('error');
  });

  it('steps once while paused and ignores step while playing', () => {
    const r = rig();
    r.loop.handle(init);
    r.loop.handle({ type: 'return', buffer: (r.frames()[0]!.msg as { buffer: ArrayBuffer }).buffer });
    r.loop.handle({ type: 'step' });
    expect(r.loop.state.tick).toBe(1);
    r.loop.handle({ type: 'play' });
    r.loop.handle({ type: 'step' });
    expect(r.loop.state.tick).toBe(1);
  });

  it('runs a tick every fourth interval at 0.25x', () => {
    const r = rig();
    r.loop.handle(init);
    r.loop.handle({ type: 'speed', ticksPerFrame: 0.25 });
    r.loop.handle({ type: 'play' });
    for (let i = 0; i < 8; i++) r.interval();
    expect(r.loop.state.tick).toBe(2);
  });

  it('caps ticks per interval and counts the dropped ones', () => {
    const r = rig();
    r.loop.handle(init);
    r.loop.handle({ type: 'speed', ticksPerFrame: 4 });
    r.loop.handle({ type: 'play' });
    r.interval();
    expect(r.loop.state.tick).toBe(4);
    // A timer that fires 10 intervals late would owe 40 ticks: 8 run, 32 are dropped.
    r.interval((1000 / 60) * 10);
    expect(r.loop.state.tick).toBe(4 + MAX_TICKS_PER_INTERVAL);
    expect(r.loop.state.dropped).toBe(32);
  });

  it('never posts while no buffer is free, then catches up when one returns', () => {
    const r = rig();
    r.loop.handle(init); // buffer A out, B free
    r.loop.handle({ type: 'play' });
    r.interval(); // B out, none free
    const before = r.frames().length;
    r.interval();
    r.interval();
    expect(r.frames()).toHaveLength(before);
    expect(r.loop.state.tick).toBe(3);
    const first = r.frames()[0]!.msg as { buffer: ArrayBuffer };
    r.loop.handle({ type: 'return', buffer: first.buffer });
    expect(r.frames()).toHaveLength(before + 1);
    expect((r.frames().at(-1)!.msg as { tick: number }).tick).toBe(3);
  });

  it('pauses by stopping the timer, and round-trips state', () => {
    const r = rig();
    r.loop.handle(init);
    r.loop.handle({ type: 'play' });
    expect(r.running()).toBe(true);
    r.loop.handle({ type: 'pause' });
    expect(r.running()).toBe(false);
    r.loop.handle({ type: 'serialise' });
    expect(r.out.at(-1)!.msg).toEqual({ type: 'state', state: 0 });
  });
});
