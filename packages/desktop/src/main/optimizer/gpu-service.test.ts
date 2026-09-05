import { describe, expect, it, vi } from 'vitest';

// getGpuStats reads `app.getGPUInfo` only through its injectable default
// parameter — every test below supplies its own `getGpuInfo`/`probe`, but the
// module-level `import { app } from 'electron'` still needs a stand-in to
// resolve outside the Electron runtime, exactly as `video-service.test.ts`
// mocks `shell` for the same reason.
vi.mock('electron', () => ({
  app: { getGPUInfo: vi.fn(async () => ({})) },
}));

import { getGpuStats } from './gpu-service';

const fakeProbe = (loadPercent: number | undefined) => ({
  disabled: false,
  sample: vi.fn(async () => loadPercent),
});

describe('getGpuStats', () => {
  it('combines model/VRAM from getGPUInfo with load from the existing probe', async () => {
    const getGpuInfo = vi.fn(async () => ({
      gpuDevice: [{ active: true, deviceString: 'Apple M2 Pro' }],
      auxAttributes: { videoMemoryMb: 16_384 },
    }));

    const result = await getGpuStats(getGpuInfo, fakeProbe(42));

    expect(result).toEqual({
      model: 'Apple M2 Pro',
      vramBytes: 16_384 * 1024 * 1024,
      loadPercent: 42,
    });
  });

  it('a getGPUInfo rejection yields nulls rather than throwing', async () => {
    const getGpuInfo = vi.fn(async () => {
      throw new Error('gpu info unavailable');
    });

    const result = await getGpuStats(getGpuInfo, fakeProbe(10));
    expect(result.model).toBeNull();
    expect(result.vramBytes).toBeNull();
    expect(result.loadPercent).toBe(10);
  });

  it('a malformed getGPUInfo payload fails the zod parse and degrades to nulls', async () => {
    const getGpuInfo = vi.fn(async () => 'not an object at all');

    const result = await getGpuStats(getGpuInfo, fakeProbe(5));
    expect(result.model).toBeNull();
    expect(result.vramBytes).toBeNull();
  });

  it('a probe that cannot sample yields a null load percent, not undefined', async () => {
    const getGpuInfo = vi.fn(async () => ({}));
    const result = await getGpuStats(getGpuInfo, fakeProbe(undefined));
    expect(result.loadPercent).toBeNull();
  });

  it('falls back to auxAttributes.glRenderer when no gpuDevice carries a deviceString', async () => {
    const getGpuInfo = vi.fn(async () => ({
      auxAttributes: { glRenderer: 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)' },
    }));
    const result = await getGpuStats(getGpuInfo, fakeProbe(0));
    expect(result.model).toBe('ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)');
  });
});
