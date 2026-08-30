import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LuLock, LuX } from 'react-icons/lu';

export const PASSCODE_LENGTH = 4;

function PasscodeFields({
  value,
  onChange,
  onComplete,
  invalid,
  disabled,
  autoFocus = true,
  digitAriaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  digitAriaLabel: (index: number) => string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const slots = Array.from({ length: PASSCODE_LENGTH }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[Math.min(value.length, PASSCODE_LENGTH - 1)]?.focus();
  }, [autoFocus, value]);

  const commit = (next: string) => {
    onChange(next);
    if (next.length === PASSCODE_LENGTH) onComplete?.(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (disabled) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value.length > 0) commit(value.slice(0, -1));
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      refs.current[Math.max(0, i - 1)]?.focus();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      refs.current[Math.min(PASSCODE_LENGTH - 1, i + 1)]?.focus();
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      if (value.length < PASSCODE_LENGTH) commit(value + e.key);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) return;
    commit((value + digits).slice(0, PASSCODE_LENGTH));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PASSCODE_LENGTH);
    if (digits) commit(digits);
  };

  return (
    <div className="flex items-center justify-center gap-2.5">
      {slots.map((char, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          value={char}
          disabled={disabled}
          aria-label={digitAriaLabel(i + 1)}
          onChange={handleChange}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          className={`h-12 w-11 rounded-lg border bg-background/80 text-center text-2xl font-semibold tabular-nums text-foreground caret-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            invalid ? 'border-destructive' : char ? 'border-foreground/60' : 'border-input'
          }`}
        />
      ))}
    </div>
  );
}

export type PasscodePadLabels = {
  unlockTitle: string;
  setTitle: string;
  confirmTitle: string;
  unlockSubtitle: string;
  chooseSubtitle: string;
  confirmSubtitle: string;
  incorrect: string;
  mismatch: string;
  cancel: string;
  digitAriaLabel: (index: number) => string;
};

const DEFAULT_LABELS: PasscodePadLabels = {
  unlockTitle: 'Enter passcode',
  setTitle: 'Set a passcode',
  confirmTitle: 'Confirm passcode',
  unlockSubtitle: 'Enter your passcode to unlock.',
  chooseSubtitle: `Choose a ${PASSCODE_LENGTH}-digit passcode.`,
  confirmSubtitle: 'Enter it again to confirm.',
  incorrect: 'Incorrect passcode.',
  mismatch: "Those didn't match. Try again.",
  cancel: 'Cancel',
  digitAriaLabel: (index) => `Passcode digit ${index}`,
};

type PasscodePadProps = {
  mode: 'set' | 'unlock';
  expected?: string;
  onSuccess: (code: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  labels?: Partial<PasscodePadLabels>;
};

export function PasscodePad({
  mode,
  expected,
  onSuccess,
  onCancel,
  autoFocus = true,
  labels,
}: PasscodePadProps) {
  const copy: PasscodePadLabels = { ...DEFAULT_LABELS, ...labels };
  const [phase, setPhase] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const reject = (message: string) => {
    setError(message);
    setShake(true);
    setValue('');
  };

  const handleComplete = (code: string) => {
    if (mode === 'unlock') {
      if (code === expected) onSuccess(code);
      else reject(copy.incorrect);
      return;
    }
    if (phase === 'enter') {
      setFirst(code);
      setValue('');
      setError(null);
      setPhase('confirm');
      return;
    }
    if (code === first) {
      onSuccess(code);
    } else {
      setFirst('');
      setPhase('enter');
      reject(copy.mismatch);
    }
  };

  const title =
    mode === 'unlock' ? copy.unlockTitle : phase === 'enter' ? copy.setTitle : copy.confirmTitle;
  const subtitle =
    mode === 'unlock'
      ? copy.unlockSubtitle
      : phase === 'enter'
        ? copy.chooseSubtitle
        : copy.confirmSubtitle;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card/60">
        <LuLock className="h-5 w-5 text-foreground/80" />
      </div>

      <div className="space-y-1 text-center">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      <div
        className={shake ? 'animate-shake' : ''}
        onAnimationEnd={() => setShake(false)}
      >
        <PasscodeFields
          key={phase}
          value={value}
          onChange={(next) => {
            setValue(next);
            if (error) setError(null);
          }}
          onComplete={handleComplete}
          invalid={!!error}
          autoFocus={autoFocus}
          digitAriaLabel={copy.digitAriaLabel}
        />
      </div>

      <p
        role="alert"
        className={`min-h-[1rem] text-xs text-destructive transition-opacity ${
          error ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {error ?? '\u00A0'}
      </p>

      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {copy.cancel}
        </button>
      ) : null}
    </div>
  );
}

function PasscodeDialog({
  label,
  closeLabel = 'Close',
  onCancel,
  children,
}: {
  label: string;
  closeLabel?: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <>
      <div
        className="fixed inset-0 z-[110] bg-background/40 backdrop-blur-md"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="pointer-events-auto w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-center justify-end px-3 pt-3">
            <button
              type="button"
              aria-label={closeLabel}
              onClick={onCancel}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LuX className="h-4 w-4" />
            </button>
          </header>
          <div className="px-6 pb-7 pt-1">{children}</div>
        </div>
      </div>
    </>
  );
}

export function PasscodeSetupDialog({
  onComplete,
  onCancel,
  label = 'Set screensaver passcode',
  closeLabel,
  labels,
}: {
  onComplete: (code: string) => void;
  onCancel: () => void;
  label?: string;
  closeLabel?: string;
  labels?: Partial<PasscodePadLabels>;
}) {
  return (
    <PasscodeDialog label={label} closeLabel={closeLabel} onCancel={onCancel}>
      <PasscodePad mode="set" onSuccess={onComplete} labels={labels} />
    </PasscodeDialog>
  );
}

export function PasscodeUnlockDialog({
  expected,
  onUnlock,
  onCancel,
  label = 'Enter passcode to unlock',
  closeLabel,
  labels,
}: {
  expected: string;
  onUnlock: () => void;
  onCancel: () => void;
  label?: string;
  closeLabel?: string;
  labels?: Partial<PasscodePadLabels>;
}) {
  return (
    <PasscodeDialog label={label} closeLabel={closeLabel} onCancel={onCancel}>
      <PasscodePad mode="unlock" expected={expected} onSuccess={onUnlock} labels={labels} />
    </PasscodeDialog>
  );
}
