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

  it('computes sha256 of text correctly', () => {
    const hash = hashSecret('secret-token-123');
    expect(hash).toHaveLength(64);
    expect(hashSecret('secret-token-123')).toBe(hash);
  });

  it('copies secret to clipboard and auto-clears after default 30s timeout', () => {
    const manager = createVaultClipboardManager(mockClipboard);
    const result = manager.copySecret('my-secret-token');

    expect(result).toEqual({ ok: true, timeoutSeconds: 30 });
    expect(mockClipboard.writeText).toHaveBeenCalledWith('my-secret-token');
    expect(mockClipboard.readText).not.toHaveBeenCalled();
    expect(clipboardText).toBe('my-secret-token');

    // Advance 29 seconds: still there
    vi.advanceTimersByTime(29_000);
    expect(clipboardText).toBe('my-secret-token');

    // Advance past 30 seconds: cleared
    vi.advanceTimersByTime(1_500);
    expect(mockClipboard.readText).toHaveBeenCalled();
    expect(clipboardText).toBe('');
    expect(mockClipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('supports custom timeout in seconds', () => {
    const manager = createVaultClipboardManager(mockClipboard);
    const result = manager.copySecret('short-lived-token', { timeoutSeconds: 15 });

    expect(result).toEqual({ ok: true, timeoutSeconds: 15 });
    vi.advanceTimersByTime(14_000);
    expect(clipboardText).toBe('short-lived-token');

    vi.advanceTimersByTime(2_000);
    expect(clipboardText).toBe('');
  });

  it('does NOT clear clipboard if user copied something else in the meantime', () => {
    const manager = createVaultClipboardManager(mockClipboard);
    manager.copySecret('original-secret');

    expect(clipboardText).toBe('original-secret');

    // User copies something else at t=10s
    vi.advanceTimersByTime(10_000);
    clipboardText = 'something-the-user-copied-later';

    // Timer fires at 30s
    vi.advanceTimersByTime(21_000);
    expect(mockClipboard.readText).toHaveBeenCalled();
    // Clipboard should NOT be wiped because hash did not match!
    expect(clipboardText).toBe('something-the-user-copied-later');
    expect(mockClipboard.writeText).not.toHaveBeenLastCalledWith('');
  });

  it('resets timer when a new secret is copied', () => {
    const manager = createVaultClipboardManager(mockClipboard);
    manager.copySecret('secret-one', { timeoutSeconds: 20 });

    vi.advanceTimersByTime(15_000);
    expect(clipboardText).toBe('secret-one');

    // Copy secret two at t=15s with 30s timeout
    manager.copySecret('secret-two', { timeoutSeconds: 30 });
    expect(clipboardText).toBe('secret-two');

    // Advance past t=20s (when timer 1 would have fired)
    vi.advanceTimersByTime(10_000); // t=25s
    expect(clipboardText).toBe('secret-two');

    // Advance to t=45s (30s after second copy)
    vi.advanceTimersByTime(21_000);
    expect(clipboardText).toBe('');
  });

  it('allows manual clearNow()', () => {
    const manager = createVaultClipboardManager(mockClipboard);
    manager.copySecret('secret');
    expect(clipboardText).toBe('secret');

    manager.clearNow();
    expect(clipboardText).toBe('');
  });
});
