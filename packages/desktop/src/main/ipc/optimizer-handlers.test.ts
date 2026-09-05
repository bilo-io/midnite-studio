import { CHANNELS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` because vitest lifts `vi.mock` above the imports: the factory
// has to close over spies that already exist by then, and this is how it does
// — same shape as `perf-handlers.test.ts`'s own `ipcMain.on` capture.
const { handle, trashItem } = vi.hoisted(() => ({
  handle: vi.fn(),
  trashItem: vi.fn(async () => undefined),
}));
vi.mock('electron', () => ({ ipcMain: { handle }, shell: { trashItem } }));

const { scanWorkspace, cleanItems, knownRoots } = vi.hoisted(() => ({
  scanWorkspace: vi.fn(),
  cleanItems: vi.fn(),
  knownRoots: vi.fn(async () => ['/root']),
}));
vi.mock('../optimizer/scan-service', () => ({ scanWorkspace, cleanItems, knownRoots }));

const { getGpuStats } = vi.hoisted(() => ({ getGpuStats: vi.fn() }));
vi.mock('../optimizer/gpu-service', () => ({ getGpuStats }));

import { registerOptimizerHandlers } from './optimizer-handlers';

/** The `ipcMain.handle` listener main registered for `channel`, invoked the way `ipcRenderer.invoke` would. */
function invoke(channel: string, raw: unknown): unknown {
  const [, listener] = handle.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler registered for ${channel}`);
  return listener({}, raw);
}

describe('registerOptimizerHandlers (Phase 59 Themes C, E)', () => {
  beforeEach(() => {
    handle.mockClear();
    trashItem.mockClear();
    scanWorkspace.mockReset();
    cleanItems.mockReset();
    knownRoots.mockClear();
    getGpuStats.mockReset();
    registerOptimizerHandlers(() => null);
  });

  describe('optimizerClean', () => {
    it('wires the delete through cleanItems to shell.trashItem — never a bare fs.rm', async () => {
      cleanItems.mockImplementation(
        async (paths: readonly string[], _roots: readonly string[], trash: (p: string) => Promise<void>) => {
          await trash(paths[0] as string);
          return { freedBytes: 200, skipped: [] };
        },
      );

      const result = await invoke(CHANNELS.optimizerClean, { paths: ['/root/node_modules'] });

      expect(trashItem).toHaveBeenCalledWith('/root/node_modules');
      expect(result).toEqual({ ok: true, value: { freedBytes: 200, skipped: [] } });
    });

    it('never throws across the boundary — a scan-service rejection becomes {ok:false}', async () => {
      cleanItems.mockRejectedValue(new Error('permission denied'));

      const result = await invoke(CHANNELS.optimizerClean, { paths: ['/root/x'] });

      expect(result).toEqual({ ok: false, message: 'permission denied' });
      expect(trashItem).not.toHaveBeenCalled();
    });
  });

  describe('optimizerScan', () => {
    it('returns an ok envelope on a successful walk', async () => {
      const value = { totalBytes: 0, byCategory: {}, items: [], truncated: false };
      scanWorkspace.mockResolvedValue(value);

      const result = await invoke(CHANNELS.optimizerScan, {});

      expect(result).toEqual({ ok: true, value });
    });

    it('never throws across the boundary', async () => {
      scanWorkspace.mockRejectedValue(new Error('walk failed'));

      const result = await invoke(CHANNELS.optimizerScan, {});

      expect(result).toEqual({ ok: false, message: 'walk failed' });
    });
  });

  describe('optimizerGpu', () => {
    it('returns an ok envelope', async () => {
      const value = { model: 'Apple M2 Pro', vramBytes: null, loadPercent: 12 };
      getGpuStats.mockResolvedValue(value);

      const result = await invoke(CHANNELS.optimizerGpu, undefined);

      expect(result).toEqual({ ok: true, value });
    });

    it('never throws across the boundary', async () => {
      getGpuStats.mockRejectedValue(new Error('gpu probe failed'));

      const result = await invoke(CHANNELS.optimizerGpu, undefined);

      expect(result).toEqual({ ok: false, message: 'gpu probe failed' });
    });
  });
});
