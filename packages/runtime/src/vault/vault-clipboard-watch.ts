import { scanText } from '@midnite/studio-shared';

import { hashSecret, type ClipboardAdapter } from './clipboard';

export interface VaultClipboardHit {
  pattern: string;
  masked: string;
  clearNow: () => void;
}

export interface VaultClipboardWatchDeps {
  clipboard: ClipboardAdapter;
  /** Opt-in switch for clipboard watching (Settings ▸ Vault). */
  isEnabled: () => boolean;
  /** Opt-in switch for auto-clearing clipboard after 60s. */
  isAutoClearEnabled?: () => boolean;
  /** Provider for live stored vault secrets. */
  getVaultSecrets?: () => string[];
  /** Fired when a vault value or secret token is copied to clipboard. */
  onSecretDetected: (hit: VaultClipboardHit) => void;
  /** Optional timer injection for deterministic testing. */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface VaultClipboardWatch {
  start(): void;
  stop(): void;
  tick(): void;
}

export const VAULT_CLIPBOARD_POLL_INTERVAL_MS = 1000;
export const VAULT_CLIPBOARD_AUTO_CLEAR_MS = 60_000;

/**
 * Opt-in clipboard watcher (Phase 118 Theme F).
 * Polls the system clipboard at <= 1 Hz (only keeping a hash of the content),
 * and when text matches a live vault secret or known token shape, notifies
 * with a "Clear now" action and optional 60-second auto-clear.
 */
export function createVaultClipboardWatch(deps: VaultClipboardWatchDeps): VaultClipboardWatch {
  let lastHash: string | null = null;
  let pollHandle: unknown = null;
  let autoClearHandle: unknown = null;

  const every =
    deps.setInterval ??
    ((fn, ms) => {
      const h = setInterval(fn, ms);
      h.unref?.();
      return h;
    });
  const cancelEvery =
    deps.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  const after = deps.setTimeout ?? setTimeout;
  const cancelAfter = deps.clearTimeout ?? clearTimeout;

  const clearNow = (targetText: string) => {
    try {
      if (deps.clipboard.readText() === targetText) {
        deps.clipboard.writeText('');
      }
    } catch {
      // Ignore clipboard access errors
    }
  };

  const tick = (): void => {
    if (!deps.isEnabled()) {
      lastHash = null;
      return;
    }

    let text = '';
    try {
      text = deps.clipboard.readText();
    } catch {
      return;
    }

    if (!text || text.trim().length === 0) {
      lastHash = null;
      return;
    }

    const hash = hashSecret(text);
    if (hash === lastHash) {
      return;
    }
    lastHash = hash;

    const extraSecrets = deps.getVaultSecrets ? deps.getVaultSecrets() : [];
    const findings = scanText(text, { extraSecrets });

    if (findings.length > 0) {
      const primaryFinding = findings[0]!;
      const hit: VaultClipboardHit = {
        pattern: primaryFinding.pattern,
        masked: primaryFinding.masked,
        clearNow: () => clearNow(text),
      };

      deps.onSecretDetected(hit);

      if (deps.isAutoClearEnabled?.()) {
        if (autoClearHandle) cancelAfter(autoClearHandle as any);
        autoClearHandle = after(() => {
          clearNow(text);
        }, VAULT_CLIPBOARD_AUTO_CLEAR_MS);
      }
    }
  };

  const start = (): void => {
    if (pollHandle) return;
    pollHandle = every(tick, VAULT_CLIPBOARD_POLL_INTERVAL_MS);
  };

  const stop = (): void => {
    if (pollHandle) {
      cancelEvery(pollHandle);
      pollHandle = null;
    }
    if (autoClearHandle) {
      cancelAfter(autoClearHandle as any);
      autoClearHandle = null;
    }
    lastHash = null;
  };

  return {
    start,
    stop,
    tick,
  };
}
