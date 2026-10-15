import { describe, expect, it, vi } from 'vitest';

import { createGpuProbe, parseGpuUtilization } from './gpu';

/** Captured `ioreg -r -d 1 -w 0 -c IOAccelerator` output, trimmed. */
const IOREG = `+-o IOGPU  <class IOGPU, id 0x100000456, registered, matched, active, busy 0 (5 ms), retain 21>
    {
      "IOGPUProcessStats" = ({"inProgressCmdBufCount"=0,"pid"=452})
      "IOClass" = "AGXAcceleratorG13X"
      "PerformanceStatistics" = {"Alloc system memory"=1483374592,"Device Utilization %"=37,"In use system memory"=0,"recoveryCount"=0,"hardwareWaitTime"=0,"Alloc system memory, in use"=0}
      "IOPlatformSleepAction" = 0
    }
`;

/** Two accelerators — the integrated one idle, the discrete one working. */
const IOREG_TWO_GPUS = `
      "PerformanceStatistics" = {"Device Utilization %"=2,"recoveryCount"=0}
      "PerformanceStatistics" = {"Device Utilization %"=88,"recoveryCount"=0}
`;

describe('parseGpuUtilization', () => {
  it('pulls the Device Utilization % counter out of a real ioreg dump', () => {
    expect(parseGpuUtilization(IOREG)).toBe(37);
  });

  it('takes the busiest accelerator, not the first one in registry order', () => {
    expect(parseGpuUtilization(IOREG_TWO_GPUS)).toBe(88);
  });

  it('is undefined — never zero — when the counter is absent', () => {
    // A machine that cannot report GPU load and one whose GPU is idle must not
    // produce the same value; a flat zero line is a lie about a working GPU.
    expect(parseGpuUtilization('"PerformanceStatistics" = {"recoveryCount"=0}')).toBeUndefined();
    expect(parseGpuUtilization('')).toBeUndefined();
    expect(parseGpuUtilization('ioreg: not found')).toBeUndefined();
  });

  it('clamps a nonsense reading into the 0-100 the contract promises', () => {
    expect(parseGpuUtilization('"Device Utilization %"=420')).toBe(100);
  });
});

describe('createGpuProbe', () => {
  it('self-disables after three consecutive failures, logging exactly once', async () => {
    const log = vi.fn();
    const run = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const probe = createGpuProbe(run, log, 'darwin');

    expect(await probe.sample()).toBeUndefined();
    expect(await probe.sample()).toBeUndefined();
    expect(probe.disabled).toBe(false);
    expect(await probe.sample()).toBeUndefined();
    expect(probe.disabled).toBe(true);

    // The point of disabling: no further subprocess is spawned, ever.
    await probe.sample();
    await probe.sample();
    expect(run).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('lets one good read clear the streak, so a transient failure is not fatal', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('EAGAIN'))
      .mockRejectedValueOnce(new Error('EAGAIN'))
      .mockResolvedValueOnce(IOREG)
      .mockRejectedValue(new Error('EAGAIN'));
    const probe = createGpuProbe(run, () => undefined, 'darwin');

    await probe.sample();
    await probe.sample();
    expect(await probe.sample()).toBe(37);
    await probe.sample();
    expect(probe.disabled).toBe(false);
  });

  it('treats unparseable output as a failure, not as a reading', async () => {
    const log = vi.fn();
    const probe = createGpuProbe(async () => 'nothing useful here', log, 'darwin');
    await probe.sample();
    await probe.sample();
    await probe.sample();
    expect(probe.disabled).toBe(true);
  });
});
