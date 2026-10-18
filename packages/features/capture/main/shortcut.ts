import type { CaptureShortcutState } from '@midnite/studio-shared';

import type { CaptureGlobalShortcut } from './port';

/**
 * The one global capture chord (Phase 113 Theme K).
 *
 * Registered only while the app runs — {@link ShortcutManager.dispose} on quit — and re-registered when
 * the user changes it, the old chord released first. `globalShortcut.register` answering false means
 * another app holds the chord: that is reported as `conflict` with a message the settings row shows,
 * never swallowed. A chord Electron throws on is `invalid`. A smoke run (`enabled: false`) registers
 * nothing and reports `disabled`.
 */
export type ShortcutManager = {
  apply: (accelerator: string | null) => CaptureShortcutState;
  state: () => CaptureShortcutState;
  dispose: () => void;
};

export function createShortcutManager(
  globalShortcut: CaptureGlobalShortcut,
  onFire: () => void,
  options: { enabled: boolean },
): ShortcutManager {
  let held: string | null = null;
  let state: CaptureShortcutState = {
    accelerator: null,
    state: options.enabled ? 'off' : 'disabled',
  };

  const release = () => {
    if (held === null) return;
    try {
      globalShortcut.unregister(held);
    } catch {
      // Already gone (Electron releases every chord on quit).
    }
    held = null;
  };

  return {
    apply: (accelerator) => {
      release();
      if (!options.enabled) {
        state = {
          accelerator,
          state: 'disabled',
          message: 'Global shortcuts are off in this run.',
        };
        return state;
      }
      if (accelerator === null) {
        state = { accelerator: null, state: 'off' };
        return state;
      }
      let taken: boolean;
      try {
        taken = globalShortcut.register(accelerator, onFire);
      } catch (error) {
        state = {
          accelerator,
          state: 'invalid',
          message: error instanceof Error ? error.message : `${accelerator} is not a shortcut.`,
        };
        return state;
      }
      if (!taken) {
        state = {
          accelerator,
          state: 'conflict',
          message: `${accelerator} is already used by another app or by macOS. Pick another chord.`,
        };
        return state;
      }
      held = accelerator;
      state = { accelerator, state: 'registered' };
      return state;
    },
    state: () => state,
    dispose: release,
  };
}
