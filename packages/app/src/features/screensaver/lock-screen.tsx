import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useWindowFocusGate } from '../../lib/use-window-focus-gate';
import { useAnyLoopRunning } from '../loops/fab-loop-halo';
import { NeuroCloudBackground } from './neuro-cloud-background';
import {
  PasscodeUnlockDialog,
  type PasscodePadLabels,
} from './passcode-pad';

export type LockScreenLabels = {
  locked?: string;
  screensaver?: string;
  unlockHint?: string;
  wakeHint?: string;
  passcodeDialogLabel?: string;
  passcodeCloseLabel?: string;
  passcode?: Partial<PasscodePadLabels>;
};

const DEFAULT_LABELS: LockScreenLabels = {
  locked: 'Locked screen',
  screensaver: 'Screensaver',
  unlockHint: 'press any key to unlock',
  wakeHint: 'press any key to wake',
};

export type LockScreenProps = {
  requireCode?: boolean;
  passcode?: string;
  onUnlock?: () => void;
  onDismiss?: () => void;
  animateBackground?: boolean;
  children?: ReactNode;
  corners?: ReactNode;
  label?: string;
  labels?: LockScreenLabels;
  /**
   * Phase 46 Theme C. A pill held behind the passcode pad runs its own,
   * independent `PasscodeUnlockDialog` (`screensaver.tsx`) rather than this
   * component's generic one — so while that is up, this component's own
   * click-anywhere / keydown-anywhere triggers must go quiet. Without this,
   * typing the pill's passcode also fires this component's own `keydown`
   * listener (it only ever checked its OWN `unlocking` flag, which the pill
   * flow never touches) and opens a SECOND, redundant dialog underneath the
   * pill's — invisible to a `fireEvent`-based unit test, since that never
   * dispatches a real `window` `keydown`, but real in a browser.
   */
  suppressUnlockTrigger?: boolean;
};

export function LockScreen({
  requireCode = false,
  passcode = '',
  onUnlock,
  onDismiss,
  animateBackground = true,
  children,
  corners,
  label,
  labels,
  suppressUnlockTrigger = false,
}: LockScreenProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [unlocking, setUnlocking] = useState(false);
  const dismissible = !requireCode;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The same `.gradient-frame` inner glow the FAB's loop console and the
  // landing page wear (`styles.css`'s `.screensaver-panel-gradient`), lit
  // across the whole screen the instant any loop is live anywhere in the FAB.
  // Window-focus-gated like those other two hosts, and only while it could
  // actually be showing: `useWindowFocusGate` counts its mounted hosts, so
  // this only joins that count while the glow itself is on.
  const { running: loopsRunning } = useAnyLoopRunning();
  useWindowFocusGate(loopsRunning);

  useEffect(() => {
    if (suppressUnlockTrigger) return;
    if (dismissible) {
      const onKey = () => onDismiss?.();
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    if (!unlocking) {
      const onKey = () => setUnlocking(true);
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [dismissible, unlocking, onDismiss, suppressUnlockTrigger]);

  if (!mounted) return null;

  const clickToUnlock = !suppressUnlockTrigger && (dismissible ? onDismiss : !unlocking ? () => setUnlocking(true) : undefined);

  return createPortal(
    <div
      role="dialog"
      aria-label={label ?? (requireCode ? copy.locked : copy.screensaver)}
      onClick={clickToUnlock || undefined}
      data-loops-running={loopsRunning ? 'true' : 'false'}
      className={`gradient-frame screensaver-panel-gradient fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background/90 px-6 text-center backdrop-blur-[120px] ${
        clickToUnlock ? 'cursor-pointer' : ''
      }`}
    >
      <NeuroCloudBackground animate={animateBackground} />

      {corners}

      <div className="relative z-10 flex flex-col items-center">{children}</div>

      <p className="absolute bottom-2 z-10 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {requireCode ? copy.unlockHint : copy.wakeHint}
      </p>

      {requireCode && unlocking && !suppressUnlockTrigger ? (
        <PasscodeUnlockDialog
          expected={passcode}
          label={copy.passcodeDialogLabel}
          closeLabel={copy.passcodeCloseLabel}
          labels={copy.passcode}
          onUnlock={() => onUnlock?.()}
          onCancel={() => setUnlocking(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
