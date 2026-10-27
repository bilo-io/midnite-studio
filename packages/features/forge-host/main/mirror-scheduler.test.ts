import { describe, expect, it } from 'vitest';

import { INTERVAL_MS, MirrorConfigSchema, type MirrorConfig } from './mirror-config';
import type { MirrorResult } from './mirror-refresh';
import { createMirrorScheduler } from './mirror-scheduler';

const repo = (host: string, name: string) => ({ host, owner: 'o', repo: name, url: `https://${host}/o/${name}` });
const ok = (key: string, at: string): MirrorResult => ({ key, status: 'ok', at, incremental: false, refs: 1 });

function harness(config: Partial<MirrorConfig>, nowMs: number) {
  const cfg = MirrorConfigSchema.parse(config);
  const log: string[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let active = 0;
  let peak = 0;
  const scheduler = createMirrorScheduler({
    load: async () => cfg,
    record: async (r) => void log.push(`record ${r.key}`),
    refresh: async (r) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((res) => setImmediate(res));
      active -= 1;
      log.push(`refresh ${r.host}/${r.repo}`);
      return ok(`${r.host}/${r.owner}/${r.repo}`, new Date(nowMs).toISOString());
    },
    now: () => nowMs,
    setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimer: () => {},
  });
  return { scheduler, log, timers, peak: () => peak };
}

describe('mirror scheduler', () => {
  it('runs only what is due on start and re-arms for the interval', async () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    const fresh = new Date(now - 1000).toISOString();
    const h = harness(
      { interval: 'daily', repos: [repo('a.com', 'due'), repo('a.com', 'fresh')], state: { 'a.com/o/fresh': { at: fresh, status: 'ok' } } },
      now,
    );
    await h.scheduler.start();
    expect(h.log).toEqual(['refresh a.com/due', 'record a.com/o/due']);
    expect(h.timers.map((t) => t.ms)).toEqual([INTERVAL_MS.daily]);
  });

  it('is idle on a manual interval until runNow, which ignores due-ness', async () => {
    const h = harness({ interval: 'manual', repos: [repo('a.com', 'x')] }, 0);
    await h.scheduler.start();
    expect(h.log).toEqual([]);
    expect(h.timers).toEqual([]);
    expect((await h.scheduler.runNow()).map((r) => r.key)).toEqual(['a.com/o/x']);
  });

  it('refreshes one host strictly serially and different hosts in parallel', async () => {
    const same = harness({ repos: [repo('a.com', '1'), repo('a.com', '2'), repo('a.com', '3')] }, 0);
    await same.scheduler.runNow();
    expect(same.peak()).toBe(1);
    const two = harness({ repos: [repo('a.com', '1'), repo('b.com', '1')] }, 0);
    await two.scheduler.runNow();
    expect(two.peak()).toBe(2);
  });

  it('does not re-arm after stop', async () => {
    const h = harness({ repos: [] }, 0);
    await h.scheduler.start();
    h.scheduler.stop();
    h.timers[0]?.fn();
    await new Promise((r) => setImmediate(r));
    expect(h.timers).toHaveLength(1);
  });
});
