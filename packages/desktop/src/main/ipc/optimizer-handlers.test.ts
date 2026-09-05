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

// Phase 73 Theme F — the four new system-cache handlers get the same
// mocked-collaborator treatment as `optimizerScan`/`optimizerClean` above,
// rather than exercising the real registry/walker from a handler-level test.
const { scanSystemCaches, cleanSystemCaches, runReclaimCommand } = vi.hoisted(() => ({
  scanSystemCaches: vi.fn(),
  cleanSystemCaches: vi.fn(),
  runReclaimCommand: vi.fn(),
}));
vi.mock('../optimizer/system-cache-service', () => ({
  scanSystemCaches,
  cleanSystemCaches,
  runReclaimCommand,
}));

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
    scanSystemCaches.mockReset();
    cleanSystemCaches.mockReset();
    runReclaimCommand.mockReset();
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

    it('forwards disabledEcosystems into scanWorkspace (Phase 72 Theme E)', async () => {
      const value = { totalBytes: 0, byCategory: {}, items: [], truncated: false };
      scanWorkspace.mockResolvedValue(value);

      await invoke(CHANNELS.optimizerScan, { disabledEcosystems: ['rust'] });

      expect(scanWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ disabledEcosystems: ['rust'] }),
      );
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

  describe('optimizerSystemCatalogue (Phase 73 Theme F)', () => {
    it('returns the real DEFAULT_SYSTEM_CACHE_ENTRIES catalogue, labels/producer only, no path', async () => {
      const result = (await invoke(CHANNELS.optimizerSystemCatalogue, undefined)) as {
        ok: true;
        value: Array<Record<string, unknown>>;
      };

      expect(result.ok).toBe(true);
      expect(result.value.length).toBeGreaterThan(0);
      for (const entry of result.value) {
        expect(Object.keys(entry).sort()).toEqual(
          ['ecosystem', 'entryId', 'label', 'producer', 'reclaim'].sort(),
        );
      }
    });
  });

  describe('optimizerSystemScan (Phase 73 Theme F)', () => {
    it('returns an ok envelope on a successful walk', async () => {
      const value = { totalBytes: 0, approximate: false, byEcosystem: {}, items: [] };
      scanSystemCaches.mockResolvedValue(value);

      const result = await invoke(CHANNELS.optimizerSystemScan, {});

      expect(result).toEqual({ ok: true, value });
    });

    it('never throws across the boundary', async () => {
      scanSystemCaches.mockRejectedValue(new Error('walk failed'));

      const result = await invoke(CHANNELS.optimizerSystemScan, {});

      expect(result).toEqual({ ok: false, message: 'walk failed' });
    });
  });

  describe('optimizerSystemClean (Phase 73 Theme F)', () => {
    it('wires the delete through cleanSystemCaches', async () => {
      cleanSystemCaches.mockResolvedValue({ freedBytes: 500, skipped: [] });

      const result = await invoke(CHANNELS.optimizerSystemClean, { entryIds: ['npm-cache'] });

      expect(cleanSystemCaches).toHaveBeenCalledWith(['npm-cache'], expect.any(Function));
      expect(result).toEqual({ ok: true, value: { freedBytes: 500, skipped: [] } });
    });

    it('never throws across the boundary', async () => {
      cleanSystemCaches.mockRejectedValue(new Error('clean failed'));

      const result = await invoke(CHANNELS.optimizerSystemClean, { entryIds: ['npm-cache'] });

      expect(result).toEqual({ ok: false, message: 'clean failed' });
    });
  });

  describe('optimizerSystemReclaim (Phase 73 Theme D, F)', () => {
    it('delegates to runReclaimCommand by entryId, verbatim', async () => {
      runReclaimCommand.mockResolvedValue({
        ok: true,
        value: { stdout: 'done', stderr: '', exitCode: 0 },
      });

      const result = await invoke(CHANNELS.optimizerSystemReclaim, { entryId: 'homebrew-cache' });

      expect(runReclaimCommand).toHaveBeenCalledWith('homebrew-cache');
      expect(result).toEqual({ ok: true, value: { stdout: 'done', stderr: '', exitCode: 0 } });
    });

    it('passes through a {ok:false} outcome unchanged, never throwing', async () => {
      runReclaimCommand.mockResolvedValue({ ok: false, message: 'brew is not installed or not on PATH.' });

      const result = await invoke(CHANNELS.optimizerSystemReclaim, { entryId: 'homebrew-cache' });

      expect(result).toEqual({ ok: false, message: 'brew is not installed or not on PATH.' });
    });
  });
});
