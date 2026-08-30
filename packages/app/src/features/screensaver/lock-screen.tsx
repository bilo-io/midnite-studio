import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
}: LockScreenProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [unlocking, setUnlocking] = useState(false);
  const dismissible = !requireCode;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
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
  }, [dismissible, unlocking, onDismiss]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-label={label ?? (requireCode ? copy.locked : copy.screensaver)}
      onClick={dismissible ? onDismiss : !unlocking ? () => setUnlocking(true) : undefined}
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background/90 px-6 text-center backdrop-blur-[120px] ${
        dismissible || !unlocking ? 'cursor-pointer' : ''
      }`}
    >
      <NeuroCloudBackground animate={animateBackground} />

      {corners}

      <div className="relative z-10 flex flex-col items-center">{children}</div>

      <p className="absolute bottom-2 z-10 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {requireCode ? copy.unlockHint : copy.wakeHint}
      </p>

      {requireCode && unlocking ? (
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
