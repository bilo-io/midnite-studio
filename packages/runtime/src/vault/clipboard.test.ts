import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createVaultClipboardManager, hashSecret, type ClipboardAdapter } from './clipboard';

describe('VaultClipboardManager', () => {
  let clipboardText = '';
  const mockClipboard: ClipboardAdapter = {
    writeText: vi.fn((text: string) => {
      clipboardText = text;
    }),
    readText: vi.fn(() => clipboardText),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    clipboardText = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a promise-based clipboard (Electron 44+ main process)', async () => {
    let text = '';
    const asyncClipboard: ClipboardAdapter = {
      writeText: async (next: string) => {
        text = next;
      },
      readText: async () => text,
    };
    const manager = createVaultClipboardManager(asyncClipboard);
    await manager.copySecret('async-secret', { timeoutSeconds: 5 });
    expect(text).toBe('async-secret');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(text).toBe('');
  });

  it('computes sha256 of text correctly', () => {
    const hash = hashSecret('secret-token-123');
    expect(hash).toHaveLength(64);
    expect(hashSecret('secret-token-123')).toBe(hash);
  });

  it('copies secret to clipboard and auto-clears after default 30s timeout', async () => {
    const manager = createVaultClipboardManager(mockClipboard);
    const result = await manager.copySecret('my-secret-token');

    expect(result).toEqual({ ok: true, timeoutSeconds: 30 });
    expect(mockClipboard.writeText).toHaveBeenCalledWith('my-secret-token');
    expect(mockClipboard.readText).not.toHaveBeenCalled();
    expect(clipboardText).toBe('my-secret-token');

    // Advance 29 seconds: still there
    await vi.advanceTimersByTimeAsync(29_000);
    expect(clipboardText).toBe('my-secret-token');

    // Advance past 30 seconds: cleared
    await vi.advanceTimersByTimeAsync(1_500);
    expect(mockClipboard.readText).toHaveBeenCalled();
    expect(clipboardText).toBe('');
    expect(mockClipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('supports custom timeout in seconds', async () => {
    const manager = createVaultClipboardManager(mockClipboard);
    const result = await manager.copySecret('short-lived-token', { timeoutSeconds: 15 });

    expect(result).toEqual({ ok: true, timeoutSeconds: 15 });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(clipboardText).toBe('short-lived-token');

    await vi.advanceTimersByTimeAsync(2_000);
    expect(clipboardText).toBe('');
  });

  it('does NOT clear clipboard if user copied something else in the meantime', async () => {
    const manager = createVaultClipboardManager(mockClipboard);
    await manager.copySecret('original-secret');

    expect(clipboardText).toBe('original-secret');

    // User copies something else at t=10s
    await vi.advanceTimersByTimeAsync(10_000);
    clipboardText = 'something-the-user-copied-later';

    // Timer fires at 30s
    await vi.advanceTimersByTimeAsync(21_000);
    expect(mockClipboard.readText).toHaveBeenCalled();
    // Clipboard should NOT be wiped because hash did not match!
    expect(clipboardText).toBe('something-the-user-copied-later');
    expect(mockClipboard.writeText).not.toHaveBeenLastCalledWith('');
  });

  it('resets timer when a new secret is copied', async () => {
    const manager = createVaultClipboardManager(mockClipboard);
    await manager.copySecret('secret-one', { timeoutSeconds: 20 });

    await vi.advanceTimersByTimeAsync(15_000);
    expect(clipboardText).toBe('secret-one');

    // Copy secret two at t=15s with 30s timeout
    await manager.copySecret('secret-two', { timeoutSeconds: 30 });
    expect(clipboardText).toBe('secret-two');

    // Advance past t=20s (when timer 1 would have fired)
    await vi.advanceTimersByTimeAsync(10_000); // t=25s
    expect(clipboardText).toBe('secret-two');

    // Advance to t=45s (30s after second copy)
    await vi.advanceTimersByTimeAsync(21_000);
    expect(clipboardText).toBe('');
  });

  it('allows manual clearNow()', async () => {
    const manager = createVaultClipboardManager(mockClipboard);
    await manager.copySecret('secret');
    expect(clipboardText).toBe('secret');

    manager.clearNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(clipboardText).toBe('');
  });
});
