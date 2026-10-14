// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { optimizerMain, type OptimizerMainServices } from './index';

/**
 * The optimizer's main half, registered against the runtime's recording
 * context instead of Electron — which is the point of a feature main half
 * that never imports `electron` (Phase 113 Theme C).
 */
function services(overrides: Partial<OptimizerMainServices> = {}): OptimizerMainServices {
  return {
    scanWorkspace: vi.fn(async () => ({ items: [] }) as never),
    knownRoots: vi.fn(async () => ['/repo']),
    cleanItems: vi.fn(async () => ({ freedBytes: 0, skipped: [] })),
    getGpuStats: vi.fn(async () => ({}) as never),
    getProcessTableResult: vi.fn(async () => ({}) as never),
    killProcess: vi.fn(async () => ({ ok: true as const })),
    systemCatalogue: vi.fn(() => []),
    scanSystemCaches: vi.fn(async () => ({}) as never),
    cleanSystemCaches: vi.fn(async () => ({ freedBytes: 0, skipped: [] })),
    runReclaimCommand: vi.fn(async () => ({ ok: false as const, message: 'no' })),
    ...overrides,
  };
}

describe('optimizerMain', () => {
  it('registers exactly the manifest channels, each once', () => {
    const ctx = createRecordingContext();
    optimizerMain.register(ctx, services());
    expect([...ctx.channels].sort()).toEqual([...optimizerMain.channels].sort());
  });

  it('forwards scan progress to the window as events', async () => {
    const ctx = createRecordingContext();
    optimizerMain.register(
      ctx,
      services({
        scanWorkspace: async ({ onProgress }) => {
          onProgress(1, 2);
          return { items: [] } as never;
        },
      }),
    );
    await expect(ctx.invoke(CHANNELS.optimizerScan, {})).resolves.toMatchObject({ ok: true });
    expect(ctx.emitted).toEqual([{ channel: EVENT_CHANNELS.optimizerScanProgress, payload: { done: 1, total: 2 } }]);
  });

  it('aborts a running scan when a second one starts', async () => {
    const signals: AbortSignal[] = [];
    let release: () => void = () => {};
    const ctx = createRecordingContext();
    optimizerMain.register(
      ctx,
      services({
        scanWorkspace: ({ signal }) => {
          signals.push(signal);
          return signals.length === 1
            ? new Promise((resolve) => (release = () => resolve({ items: [] } as never)))
            : Promise.resolve({ items: [] } as never);
        },
      }),
    );
    const first = ctx.invoke(CHANNELS.optimizerScan, {});
    await ctx.invoke(CHANNELS.optimizerScan, {});
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    release();
    await first;
  });

  it('moves cleaned paths through the context’s trash, confined to the known roots', async () => {
    const ctx = createRecordingContext();
    const cleanItems = vi.fn<OptimizerMainServices['cleanItems']>(async (paths, _roots, trash) => {
      for (const path of paths) await trash(path);
      return { freedBytes: 10, skipped: [] };
    });
    optimizerMain.register(ctx, services({ cleanItems }));
    await expect(ctx.invoke(CHANNELS.optimizerClean, { paths: ['/repo/node_modules'] })).resolves.toEqual({
      ok: true,
      value: { freedBytes: 10, skipped: [] },
    });
    expect(cleanItems.mock.calls[0]?.[1]).toEqual(['/repo']);
    expect(ctx.trashed).toEqual(['/repo/node_modules']);
  });

  it('answers an invalid payload and a throwing service with the error envelope, never a rejection', async () => {
    const ctx = createRecordingContext();
    optimizerMain.register(
      ctx,
      services({
        getGpuStats: async () => {
          throw new Error('no gpu');
        },
      }),
    );
    await expect(ctx.invoke(CHANNELS.optimizerKill, { pid: 'nope' })).resolves.toMatchObject({ ok: false });
    await expect(ctx.invoke(CHANNELS.optimizerGpu)).resolves.toEqual({ ok: false, message: 'no gpu' });
  });
});
