/**
 * The one place that decides when boot-time work that reads the vault may first reach the keychain.
 *
 * On macOS every vault read can mean a "Midnite Studio Safe Storage" prompt, and a prompt before any
 * window has shown is the worst moment for one. `fn` therefore runs once, on whichever comes first:
 *
 *  (a) the vault's first real access (`onFirstAccess`), which is already a prompt-worthy moment; or
 *  (b) the main window's first `ready-to-show`, then its first `focus`, then a short idle. This
 *      exists so disk redaction (`setDiskRedactionSecrets`) still gets a snapshot this session even
 *      when nothing else touches the vault: redaction is deferred, never dropped. Until it loads,
 *      history writes keep the old behaviour (no scrubbing), the same as a locked vault. (b) is
 *      skipped entirely on a profile with no vault files, which has nothing to snapshot.
 */

/** The slice of a `BrowserWindow` the gate listens to. */
export interface GateWindow {
  once(event: 'ready-to-show' | 'focus', listener: () => void): unknown;
  isFocused?(): boolean;
}

export interface KeychainGateOptions {
  /** Whether any vault file exists (a stat only, never the cipher). */
  vaultPresent: () => boolean;
  /** Registers a listener for the vault's first real access. */
  onFirstAccess: (listener: () => void) => unknown;
  /** Idle after first focus before `fn` runs on path (b). */
  idleMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
}

export interface KeychainGate {
  /** Feeds path (b) with the main window. Call once the window exists. */
  attachWindow(window: GateWindow): void;
  readonly ran: boolean;
}

export function whenKeychainMayBeTouched(fn: () => void, options: KeychainGateOptions): KeychainGate {
  const idleMs = options.idleMs ?? 2000;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  let ran = false;
  const run = (): void => {
    if (ran) return;
    ran = true;
    fn();
  };

  options.onFirstAccess(run);

  return {
    get ran() {
      return ran;
    },
    attachWindow(window) {
      if (ran || !options.vaultPresent()) return;
      window.once('ready-to-show', () => {
        window.once('focus', () => {
          setTimer(run, idleMs);
        });
        if (window.isFocused?.()) setTimer(run, idleMs);
      });
    },
  };
}
