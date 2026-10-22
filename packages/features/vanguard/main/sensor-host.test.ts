import {
  DEFAULT_VANGUARD_SETTINGS,
  type NewSecurityFinding,
  type VanguardSettings,
} from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createSensorHost, type SensorDefinition, type SensorTimers } from './sensor-host';

function fakeTimers() {
  const fns = new Map<number, () => void>();
  let next = 1;
  const timers: SensorTimers = {
    setInterval: (fn) => {
      fns.set(next, fn);
      return next++;
    },
    clearInterval: (h) => {
      fns.delete(h as number);
    },
  };
  return { timers, fire: () => [...fns.values()].forEach((f) => f()), count: () => fns.size };
}

function setup(
  over: Partial<VanguardSettings> = {},
  autostart: 'always' | 'after-view-opened' = 'always',
) {
  const settings: VanguardSettings = { ...DEFAULT_VANGUARD_SETTINGS, sensors: {}, ...over };
  const t = fakeTimers();
  const recorded: NewSecurityFinding[] = [];
  const onChanged = vi.fn();
  const host = createSensorHost({
    userData: '/u',
    runProcess: async () => ({ ok: false, reason: 'failed', hint: 'none' }),
    record: async (f) => {
      recorded.push(f);
      return { ...f, id: 'x', firstSeen: 1, lastSeen: 1, count: 1, status: 'open' } as never;
    },
    settings: () => settings,
    autostart,
    onChanged,
    timers: t.timers,
  });
  return { host, settings, t, recorded, onChanged };
}

const finding: Omit<NewSecurityFinding, 'source'> = {
  fingerprint: 'f',
  severity: 'low',
  category: 'config',
  title: 't',
  detail: 'd',
  evidence: [],
  remediation: [],
};

describe('sensor host', () => {
  it('runs a sensor at start, again on its timer, and reports state and the finding count', async () => {
    const { host, t, recorded } = setup();
    const run = vi.fn(async (ctx: Parameters<NonNullable<SensorDefinition['run']>>[0]) => {
      await ctx.record(finding);
    });
    host.register({ id: 's', label: 'S', description: 'd', schedule: { kind: 'cadence' }, run });
    expect(host.status().sensors[0]?.state).toBe('disabled');
    await host.start();
    // The first run is not awaited by `start`: let it finish before the timer fires.
    await vi.waitFor(() => expect(host.status().sensors[0]?.lastRunAt).not.toBeNull());
    expect(run).toHaveBeenCalledTimes(1);
    expect(recorded[0]?.source).toBe('vanguard');
    t.fire();
    await vi.waitFor(() => expect(host.status().sensors[0]?.state).toBe('idle'));
    expect(run).toHaveBeenCalledTimes(2);
    const status = host.status().sensors[0]!;
    expect(status).toMatchObject({ state: 'idle', enabled: true, lastFindings: 1 });
    expect(status.lastRunAt).not.toBeNull();
  });

  it('marks a throwing sensor as error without stopping the others', async () => {
    const { host } = setup();
    host.register({
      id: 'bad',
      label: 'B',
      description: '',
      schedule: { kind: 'none' },
      run: () => {
        throw new Error('boom');
      },
    });
    const ok = vi.fn();
    host.register({ id: 'good', label: 'G', description: '', schedule: { kind: 'none' }, run: ok });
    await host.start();
    const [bad, good] = host.status().sensors;
    expect(bad).toMatchObject({ state: 'error', error: 'boom' });
    expect(good?.state).toBe('idle');
    expect(ok).toHaveBeenCalled();
  });

  it('starts nothing in Studio until the view has been opened once, and says so only the first time', async () => {
    const { host } = setup({}, 'after-view-opened');
    const run = vi.fn();
    host.register({ id: 's', label: 'S', description: '', schedule: { kind: 'none' }, run });
    await host.start();
    expect(run).not.toHaveBeenCalled();
    expect(host.status().active).toBe(false);
    expect(await host.viewOpened()).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await host.viewOpened()).toBe(false);
  });

  it('honours a persisted viewOpened and the per-sensor switch', async () => {
    const { host, settings } = setup(
      { viewOpened: true, sensors: { off: false } },
      'after-view-opened',
    );
    const a = vi.fn();
    const b = vi.fn();
    host.register({ id: 'on', label: '', description: '', schedule: { kind: 'none' }, run: a });
    host.register({ id: 'off', label: '', description: '', schedule: { kind: 'none' }, run: b });
    await host.start();
    expect(a).toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    settings.sensors.off = true;
    await host.applySettings();
    expect(b).toHaveBeenCalled();
  });

  it('stop clears timers, aborts the signal and runs the disposer', async () => {
    const { host, t } = setup();
    const dispose = vi.fn();
    let signal: AbortSignal | undefined;
    host.register({
      id: 's',
      label: '',
      description: '',
      schedule: { kind: 'interval', ms: 10 },
      start: (ctx) => {
        signal = ctx.signal;
        return dispose;
      },
      run: () => undefined,
    });
    await host.start();
    expect(t.count()).toBe(1);
    await host.stop();
    expect(t.count()).toBe(0);
    expect(signal?.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(host.status().sensors[0]?.state).toBe('disabled');
  });

  it('never overlaps a sensor with itself, and refuses a duplicate id', async () => {
    const { host, t } = setup();
    let release: () => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    host.register({ id: 's', label: '', description: '', schedule: { kind: 'cadence' }, run });
    expect(() =>
      host.register({ id: 's', label: '', description: '', schedule: { kind: 'none' } }),
    ).toThrow();
    const started = host.start();
    await Promise.resolve();
    t.fire();
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await started;
  });
});
