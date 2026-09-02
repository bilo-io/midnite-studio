import { useAppearanceStore } from '../../store/appearance-store';
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
  const motion = useAppearanceStore((s) => s.motion);

  const reading = useScreensaverReading();

  const requireCode =
    requirePasscode && !!passcode && (passcodeOnlyWhenLocked ? locked : true);

  return (
    <LockScreen
      requireCode={requireCode}
      passcode={passcode ?? ''}
      onUnlock={onClose}
      onDismiss={onClose}
      animateBackground={motion !== 'reduced'}
      corners={<LockScreenChrome />}
    >
      <ScreensaverStage {...reading} />
    </LockScreen>
  );
}
