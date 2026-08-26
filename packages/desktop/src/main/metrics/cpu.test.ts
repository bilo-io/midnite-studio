import { describe, expect, it } from 'vitest';

import { cpuUsageBetween, createCpuProbe, snapshotCpuTimes, type CpuSnapshot } from './cpu';

const core = (user: number, nice: number, sys: number, idle: number, irq: number) => ({
  times: { user, nice, sys, idle, irq },
});

describe('snapshotCpuTimes', () => {
  it('sums every mode across every core, keeping idle separately', () => {
    const snapshot = snapshotCpuTimes([core(100, 0, 50, 850, 0), core(200, 0, 50, 750, 0)]);
    expect(snapshot).toEqual({ idle: 1600, total: 2000, cores: 2 });
  });

  it('reports zero cores rather than throwing on an empty list', () => {
    expect(snapshotCpuTimes([])).toEqual({ idle: 0, total: 0, cores: 0 });
  });
});

describe('cpuUsageBetween', () => {
  const at = (idle: number, total: number): CpuSnapshot => ({ idle, total, cores: 4 });

  it('is 1 - idleDelta/totalDelta, expressed as a percentage', () => {
    // 200 ticks passed, 50 of them idle → 75% busy.
    expect(cpuUsageBetween(at(1000, 4000), at(1050, 4200))).toBe(75);
  });

  it('reads a fully idle interval as 0 and a fully busy one as 100', () => {
    expect(cpuUsageBetween(at(1000, 4000), at(1200, 4200))).toBe(0);
    expect(cpuUsageBetween(at(1000, 4000), at(1000, 4200))).toBe(100);
  });

  it('is undefined — not 0 — when the counters did not advance', () => {
    // Two reads inside one clock tick. Nothing was observed, which is a
    // different statement from "nothing was running".
    expect(cpuUsageBetween(at(1000, 4000), at(1000, 4000))).toBeUndefined();
  });

  it('is undefined when a counter went backwards, as it does across a sleep', () => {
    expect(cpuUsageBetween(at(1000, 4000), at(900, 3900))).toBeUndefined();
    expect(cpuUsageBetween(at(1000, 4000), at(900, 4200))).toBeUndefined();
  });
});

describe('createCpuProbe', () => {
  it('has no answer on the first call, because a cumulative counter needs two reads', () => {
    const readings: CpuSnapshot[] = [
      { idle: 1000, total: 4000, cores: 8 },
      { idle: 1050, total: 4200, cores: 8 },
    ];
    let index = 0;
    const probe = createCpuProbe(() => readings[index++]!);

    expect(probe.sample()).toEqual({ usage: undefined, cores: 8 });
    expect(probe.sample()).toEqual({ usage: 75, cores: 8 });
  });

  it('differences against the previous call, not against the first one', () => {
    const readings: CpuSnapshot[] = [
      { idle: 1000, total: 4000, cores: 4 },
      { idle: 1100, total: 4200, cores: 4 },
      { idle: 1150, total: 4400, cores: 4 },
    ];
    let index = 0;
    const probe = createCpuProbe(() => readings[index++]!);

    probe.sample();
    expect(probe.sample().usage).toBe(50);
    // Against the first snapshot this would read 62.5; against the second, 75.
    expect(probe.sample().usage).toBe(75);
  });
});
