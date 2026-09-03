import { useUiStore } from '../../store/ui-store';
import { LockScreen } from './lock-screen';
import { LockScreenChrome } from './lock-screen-chrome';
import { ScreensaverStage, useScreensaverReading } from './screensaver-stage';

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

  const reading = useScreensaverReading();

  const requireCode =
    requirePasscode && !!passcode && (passcodeOnlyWhenLocked ? locked : true);

  return (
    <LockScreen
      requireCode={requireCode}
      passcode={passcode ?? ''}
      onUnlock={onClose}
      onDismiss={onClose}
      corners={<LockScreenChrome />}
    >
      <ScreensaverStage {...reading} />
    </LockScreen>
  );
}
