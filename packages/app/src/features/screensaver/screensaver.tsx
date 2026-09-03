import { useState } from 'react';

import { useUiStore } from '../../store/ui-store';
import { LockScreen } from './lock-screen';
import { LockScreenChrome } from './lock-screen-chrome';
import { PasscodeUnlockDialog } from './passcode-pad';
import { applyPillDestination } from './pill-destinations';
import { ScreensaverStage, useScreensaverReading, type PillKey } from './screensaver-stage';

/**
 * The screensaver / lock screen.
 *
 * Since the landing page landed this file is only the *policy* — when a
 * passcode applies, what dismissal means — over two shared pieces:
 * `LockScreenChrome` (the corners) and `ScreensaverStage` (the centre
 * column). The landing page (`features/landing/`) reuses both, which is why
 * neither lives here any more.
 *
 * `LockScreen`'s `animateBackground` is left at its default (`true`) rather
 * than derived from `motion` here — that used to read `motion !== 'reduced'`,
 * which treats the default `'system'` as "animate" even when the OS asks for
 * reduced motion. `NeuroCloudBackground` now resolves the effective motion
 * state itself (Phase 46 Theme E), so the caller no longer has to get that
 * resolution right on its behalf.
 */
export function Screensaver({
  onClose,
  locked = false,
}: {
  onClose: () => void;
  locked?: boolean;
}) {
  const requirePasscode = useUiStore((s) => s.requirePasscode);
  const passcode = useUiStore((s) => s.passcode);
  const passcodeOnlyWhenLocked = useUiStore((s) => s.passcodeOnlyWhenLocked);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const setReposOpen = useUiStore((s) => s.setReposOpen);
  const setTerminalOpen = useUiStore((s) => s.setTerminalOpen);

  const reading = useScreensaverReading();

  const requireCode =
    requirePasscode && !!passcode && (passcodeOnlyWhenLocked ? locked : true);

  /**
   * A pill clicked behind a passcode has to hold its destination across the
   * pad, apply it on unlock and drop it on cancel — anything else is a
   * lock-screen bypass (Phase 46 Theme C). A second, independent
   * `PasscodeUnlockDialog` rather than a hook into `LockScreen`'s own
   * internal `unlocking` state: the two stay deliberately separate, so a
   * cancelled pill-intent can never accidentally unlock the generic screen
   * underneath it, and a generic unlock never accidentally fires a pill's
   * navigation it was never asked for.
   */
  const [pendingPill, setPendingPill] = useState<PillKey | null>(null);

  const navigate = (key: PillKey) =>
    applyPillDestination(key, { setActiveView, setReposOpen, setTerminalOpen });

  const handlePillClick = (key: PillKey) => {
    if (requireCode) {
      setPendingPill(key);
      return;
    }
    onClose();
    navigate(key);
  };

  return (
    <LockScreen
      requireCode={requireCode}
      passcode={passcode ?? ''}
      onUnlock={onClose}
      onDismiss={onClose}
      corners={<LockScreenChrome />}
      suppressUnlockTrigger={pendingPill !== null}
    >
      <ScreensaverStage {...reading} onPillClick={handlePillClick} />
      {pendingPill ? (
        // Nested inside `LockScreen`'s own children, not a separate portal:
        // `LockScreen`'s root is `fixed inset-0 z-[200]` and this dialog's
        // own backdrop is `z-[110]` — a sibling portal at the same
        // `document.body` level would sit UNDER that backdrop and swallow
        // every click. Nesting here puts it inside that same stacking
        // context instead, where `z-[110]` only has to beat its own siblings.
        <PasscodeUnlockDialog
          expected={passcode ?? ''}
          onUnlock={() => {
            const key = pendingPill;
            setPendingPill(null);
            onClose();
            navigate(key);
          }}
          onCancel={() => setPendingPill(null)}
        />
      ) : null}
    </LockScreen>
  );
}
