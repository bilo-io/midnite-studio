import { CHANNELS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle } }));

const { computeTrashSummary, emptyTrash } = vi.hoisted(() => ({
  computeTrashSummary: vi.fn(),
  emptyTrash: vi.fn(),
}));
vi.mock('../trash-service', () => ({ computeTrashSummary, emptyTrash }));

import { registerTrashHandlers } from './trash-handlers';

/** The `ipcMain.handle` listener main registered for `channel`, invoked the way `ipcRenderer.invoke` would. */
function invoke(channel: string, raw: unknown): unknown {
  const [, listener] = handle.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler registered for ${channel}`);
  return listener({}, raw);
}

describe('registerTrashHandlers (Phase 74 Themes B, C)', () => {
  beforeEach(() => {
    handle.mockClear();
    computeTrashSummary.mockReset();
    emptyTrash.mockReset();
    registerTrashHandlers();
  });

  it('registers both channels', () => {
    expect(handle.mock.calls.map(([ch]) => ch)).toEqual(
      expect.arrayContaining([CHANNELS.optimizerTrashSummary, CHANNELS.optimizerTrashEmpty]),
    );
  });

  describe('optimizerTrashSummary', () => {
    it('returns an ok envelope on a successful walk', async () => {
      const value = {
        itemCount: 2,
        totalBytes: 100,
        oldestModifiedAt: null,
        volumeCount: 1,
        truncated: false,
      };
      computeTrashSummary.mockResolvedValue(value);

      const result = await invoke(CHANNELS.optimizerTrashSummary, undefined);

      expect(result).toEqual({ ok: true, value });
    });

    it('never throws across the boundary', async () => {
      computeTrashSummary.mockRejectedValue(new Error('walk failed'));

      const result = await invoke(CHANNELS.optimizerTrashSummary, undefined);

      expect(result).toEqual({ ok: false, message: 'walk failed' });
    });

    it('a second invoke aborts the first', async () => {
      const signals: AbortSignal[] = [];
      computeTrashSummary.mockImplementation(async ({ signal }: { signal: AbortSignal }) => {
        signals.push(signal);
        return {
          itemCount: 0,
          totalBytes: 0,
          oldestModifiedAt: null,
          volumeCount: 0,
          truncated: false,
        };
      });

      // Called back to back, synchronously — the first handler's own
      // `currentSummary = controller` assignment runs before it yields at its
      // `await computeTrashSummary(...)`, so the second invoke's synchronous
      // `currentSummary?.abort()` reaches the first controller.
      const first = invoke(CHANNELS.optimizerTrashSummary, undefined);
      const second = invoke(CHANNELS.optimizerTrashSummary, undefined);

      await Promise.all([first, second]);

      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(true);
    });
  });

  describe('optimizerTrashEmpty', () => {
    it('passes no argument through to emptyTrash', async () => {
      emptyTrash.mockResolvedValue({ ok: true });

      const result = await invoke(CHANNELS.optimizerTrashEmpty, undefined);

      expect(emptyTrash).toHaveBeenCalledWith();
      expect(result).toEqual({ ok: true });
    });

    it('never throws across the boundary', async () => {
      emptyTrash.mockRejectedValue(new Error('osascript exploded'));

      const result = await invoke(CHANNELS.optimizerTrashEmpty, undefined);

      expect(result).toEqual({ ok: false, message: 'osascript exploded' });
    });
  });
});
