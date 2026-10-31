import { createHash } from 'node:crypto';

/**
 * Minimal clipboard interface injected into the runtime from the main process.
 * This keeps `@midnite/studio-runtime` free from direct electron dependencies.
 * Electron 44+'s main-process `clipboard` is promise-based, so both calls may return a promise.
 */
export type ClipboardAdapter = {
  writeText(text: string): Promise<void> | void;
  readText(): Promise<string> | string;
};

export interface VaultClipboardManager {
  /**
   * Writes the secret to the clipboard, hashes it, and schedules auto-clear after `timeoutSeconds`.
   * Clears the clipboard only if the content still matches the SHA-256 hash when the timer fires.
   */
  copySecret(
    secret: string,
    options?: { timeoutSeconds?: number },
  ): Promise<{ ok: boolean; timeoutSeconds: number }>;
  /** Immediately clears any active clipboard clear timer and empties the clipboard. */
  clearNow(): void;
  /** Cancels any pending auto-clear timer without modifying clipboard contents. */
  dispose(): void;
}

export function hashSecret(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function createVaultClipboardManager(clipboard: ClipboardAdapter): VaultClipboardManager {
  let activeTimer: NodeJS.Timeout | null = null;
  let expectedHash: string | null = null;

  const clearTimer = () => {
    if (activeTimer) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }
    expectedHash = null;
  };

  const clearNow = () => {
    clearTimer();
    void Promise.resolve()
      .then(() => clipboard.writeText(''))
      .catch(() => undefined);
  };

  const copySecret = async (
    secret: string,
    options?: { timeoutSeconds?: number },
  ): Promise<{ ok: boolean; timeoutSeconds: number }> => {
    clearTimer();
    const timeoutSeconds = Math.max(1, Math.min(300, options?.timeoutSeconds ?? 30));
    const hash = hashSecret(secret);
    expectedHash = hash;
    await clipboard.writeText(secret);
    // A copy or clear that landed while this write was pending owns the clipboard now.
    if (expectedHash !== hash) return { ok: true, timeoutSeconds };

    const timer = setTimeout(async () => {
      try {
        if (expectedHash === hash) {
          const current = await clipboard.readText();
          if (hashSecret(current) === hash) {
            await clipboard.writeText('');
          }
        }
      } catch {
        // Silently tolerate platform clipboard errors during background auto-clear
      } finally {
        if (expectedHash === hash) {
          activeTimer = null;
          expectedHash = null;
        }
      }
    }, timeoutSeconds * 1000);

    timer.unref?.();
    activeTimer = timer;

    return { ok: true, timeoutSeconds };
  };

  return {
    copySecret,
    clearNow,
    dispose: clearTimer,
  };
}
