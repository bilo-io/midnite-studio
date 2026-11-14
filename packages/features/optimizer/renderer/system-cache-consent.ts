import type { FrameDialogs } from '@midnite/studio-frame';

import type { OptimizerSettingsState } from './host';

/**
 * The one-time system-cache consent (Phase 73 Theme C), as a function so Settings ▸ Optimizer and
 * the monitor flyout's Clean system (Phase 148 Theme E) ask the identical question. Only the
 * confirm sets the two booleans together, so the setting is never on without consent recorded.
 */
export function requestSystemCacheConsent(
  dialogs: Pick<FrameDialogs, 'confirm'>,
  settings: Pick<OptimizerSettingsState, 'setAllowSystemCacheClean' | 'setSystemCacheConsentGiven'>,
  labels: readonly string[],
  onGiven?: () => void,
): void {
  dialogs.confirm({
    title: 'Allow Midnite to clean caches outside your repos?',
    body: 'Midnite can now scan and clean caches outside any repo it manages, in your home directory. Nothing outside the named list below is ever touched, deletes still go to the Trash first, and this never reaches Photos, Documents, Desktop, or any repo’s actual source.',
    confirmLabel: 'I understand — allow it',
    danger: true,
    // Explicitly null: nothing has been scanned yet, and an absent
    // blastRadius renders "Checking what this affects…", which would be a
    // lie here. `null` skips straight to body + warnings.
    blastRadius: null,
    warnings: [...labels],
    onConfirm: () => {
      settings.setAllowSystemCacheClean(true);
      settings.setSystemCacheConsentGiven(true);
      onGiven?.();
    },
  });
}
