import { describe, expect, it, vi } from 'vitest';

import { createVaultClipboardWatch, type VaultClipboardHit } from './vault-clipboard-watch';

describe('createVaultClipboardWatch (Phase 118 Theme F)', () => {
  const createMockClipboard = (initial = '') => {
    let current = initial;
    return {
      readText: vi.fn(() => current),
      writeText: vi.fn((text: string) => {
        current = text;
      }),
      setText: (text: string) => {
        current = text;
      },
    };
  };

  it('does nothing when disabled', () => {
    const clipboard = createMockClipboard('ghp_abcdef1234567890abcdef12345678');
    const onSecretDetected = vi.fn();

    const watch = createVaultClipboardWatch({
      clipboard,
      isEnabled: () => false,
      onSecretDetected,
    });

    watch.tick();
    expect(onSecretDetected).not.toHaveBeenCalled();
  });

  it('detects a secret shape when enabled and clipboard text changes', () => {
    const clipboard = createMockClipboard('');
    const hits: VaultClipboardHit[] = [];

    const watch = createVaultClipboardWatch({
      clipboard,
      isEnabled: () => true,
      onSecretDetected: (hit) => hits.push(hit),
    });

    // Initial empty tick
    watch.tick();
    expect(hits).toHaveLength(0);

    // Copy a token to clipboard
    clipboard.setText('ghp_abcdef1234567890abcdef12345678');
    watch.tick();

    expect(hits).toHaveLength(1);
    expect(hits[0]!.pattern).toBe('github-token');
    expect(hits[0]!.masked).toBe('ghp_...5678');

    // Duplicate tick without clipboard change does not re-trigger
    watch.tick();
    expect(hits).toHaveLength(1);

    // User clicks "Clear now"
    hits[0]!.clearNow();
    expect(clipboard.readText()).toBe('');
  });

  it('detects a live vault secret on clipboard', () => {
    const clipboard = createMockClipboard('');
    const hits: VaultClipboardHit[] = [];
    const vaultSecret = 'confidential-vault-credential-123';

    const watch = createVaultClipboardWatch({
      clipboard,
      isEnabled: () => true,
      getVaultSecrets: () => [vaultSecret],
      onSecretDetected: (hit) => hits.push(hit),
    });

    clipboard.setText(vaultSecret);
    watch.tick();

    expect(hits).toHaveLength(1);
    expect(hits[0]!.pattern).toBe('vault-secret');
  });

  it('auto-clears clipboard after 60s when auto-clear switch is enabled', () => {
    const clipboard = createMockClipboard('');
    let scheduledTimer: (() => void) | null = null;

    const fakeSetTimeout = (fn: () => void, _ms: number): unknown => {
      scheduledTimer = fn;
      return 123;
    };

    const watch = createVaultClipboardWatch({
      clipboard,
      isEnabled: () => true,
      isAutoClearEnabled: () => true,
      onSecretDetected: () => {},
      setTimeout: fakeSetTimeout,
    });

    clipboard.setText('ghp_abcdef1234567890abcdef12345678');
    watch.tick();

    expect(scheduledTimer).not.toBeNull();
    expect(clipboard.readText()).not.toBe('');

    // Fast forward 60 seconds
    scheduledTimer!();
    expect(clipboard.readText()).toBe('');
  });
});
