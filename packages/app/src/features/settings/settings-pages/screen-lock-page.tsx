import { useState } from 'react';
import { Accordion } from '@bilo-io/ui';
import { LuClock, LuLock } from 'react-icons/lu';

import { useUiStore } from '../../../store/ui-store';
import { PasscodeSetupDialog } from '../../screensaver/passcode-pad';
import { Choice, Field } from './controls';

export const INACTIVITY_MIN_S = 60;
export const INACTIVITY_MAX_S = 14400;
export const INACTIVITY_DEFAULT_S = 900;

export const INACTIVITY_PRESETS_S = [
  60, // 1m
  300, // 5m
  600, // 10m
  900, // 15m
  1800, // 30m
  3600, // 1h
  7200, // 2h
  14400, // 4h
];

export function nearestInactivityPresetIndex(seconds: number): number {
  let bestIndex = 0;
  let minDiff = Infinity;
  INACTIVITY_PRESETS_S.forEach((preset, idx) => {
    const diff = Math.abs(preset - seconds);
    if (diff < minDiff) {
      minDiff = diff;
      bestIndex = idx;
    }
  });
  return bestIndex;
}

export const CYCLE_MIN_S = 3;
export const CYCLE_MAX_S = 30;
export const CYCLE_DEFAULT_S = 10;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export function ScreenLockPage() {
  const inactivityTimeoutS = useUiStore((s) => s.inactivityTimeoutS);
  const setInactivityTimeout = useUiStore((s) => s.setInactivityTimeout);
  const cycleDurationS = useUiStore((s) => s.cycleDurationS);
  const setCycleDuration = useUiStore((s) => s.setCycleDuration);

  const requirePasscode = useUiStore((s) => s.requirePasscode);
  const passcode = useUiStore((s) => s.passcode);
  const passcodeOnlyWhenLocked = useUiStore((s) => s.passcodeOnlyWhenLocked);
  const setRequirePasscode = useUiStore((s) => s.setRequirePasscode);
  const setPasscode = useUiStore((s) => s.setPasscode);
  const setPasscodeOnlyWhenLocked = useUiStore((s) => s.setPasscodeOnlyWhenLocked);

  const [setup, setSetup] = useState<'enable' | 'change' | null>(null);
  const hasPasscode = !!passcode;

  const idleTimeout = Math.min(
    INACTIVITY_MAX_S,
    Math.max(INACTIVITY_MIN_S, inactivityTimeoutS),
  );

  const cycleDuration = Math.min(CYCLE_MAX_S, Math.max(CYCLE_MIN_S, cycleDurationS));

  const toggleRequirePasscode = (on: boolean) => {
    if (on && !hasPasscode) setSetup('enable');
    else setRequirePasscode(on);
  };

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Screensaver" icon={<LuClock className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">Inactivity timeout</p>
              <p className="text-[11px] text-muted-foreground">
                How long the app stays idle before starting the screensaver.
              </p>
            </div>
            <div className="flex h-8 min-w-[3.5rem] items-center justify-center rounded border border-border bg-card px-3 text-sm font-semibold tabular-nums">
              {formatDuration(idleTimeout)}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
              {formatDuration(INACTIVITY_MIN_S)}
            </span>
            <input
              type="range"
              min={0}
              max={INACTIVITY_PRESETS_S.length - 1}
              step={1}
              value={nearestInactivityPresetIndex(idleTimeout)}
              onChange={(e) => setInactivityTimeout(INACTIVITY_PRESETS_S[Number(e.target.value)]!)}
              aria-label="Inactivity timeout"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
            />
            <span className="w-8 text-xs text-muted-foreground tabular-nums">
              {formatDuration(INACTIVITY_MAX_S)}
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Default {formatDuration(INACTIVITY_DEFAULT_S)} (range {formatDuration(INACTIVITY_MIN_S)} – {formatDuration(INACTIVITY_MAX_S)})
          </p>

          <div className="space-y-4 border-t border-border/60 pt-4">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Cycle duration</p>
                <p className="text-[11px] text-muted-foreground">
                  How long each phrase stays visible before advancing to the next.
                </p>
              </div>
              <div className="flex h-8 min-w-[3.5rem] items-center justify-center rounded border border-border bg-card px-3 text-sm font-semibold tabular-nums">
                {cycleDuration}s
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">
                {CYCLE_MIN_S}s
              </span>
              <input
                type="range"
                min={CYCLE_MIN_S}
                max={CYCLE_MAX_S}
                step={1}
                value={cycleDuration}
                onChange={(e) => setCycleDuration(Number(e.target.value))}
                aria-label="Cycle duration"
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
              />
              <span className="w-8 text-xs text-muted-foreground tabular-nums">{CYCLE_MAX_S}s</span>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Default {CYCLE_DEFAULT_S}s (range {CYCLE_MIN_S}s – {CYCLE_MAX_S}s)
            </p>
          </div>
        </div>
      </Accordion>

      <Accordion title="Screen Lock" icon={<LuLock className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Require passcode"
            hint="Prompt for a 4-digit passcode before leaving the screensaver."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={requirePasscode}
                onChange={(e) => toggleRequirePasscode(e.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Require passcode to unlock
            </label>
          </Field>

          <Field
            label="Only when manually locked"
            hint="Require passcode only when locked deliberately, not for idle screensaver."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={passcodeOnlyWhenLocked}
                disabled={!requirePasscode}
                onChange={(e) => setPasscodeOnlyWhenLocked(e.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Only when manually locked
            </label>
          </Field>

          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-3">
            <div className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${
                  hasPasscode ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/40'
                }`}
              />
              <span className={hasPasscode ? 'text-foreground' : 'text-muted-foreground'}>
                {hasPasscode ? 'Passcode set' : 'No passcode set'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSetup('change')}
                className="rounded border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent"
              >
                {hasPasscode ? 'Change' : 'Set passcode'}
              </button>
              {hasPasscode ? (
                <button
                  type="button"
                  onClick={() => setPasscode(null)}
                  className="rounded px-2.5 py-1 text-xs font-medium text-destructive hover:bg-accent"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </Accordion>

      {setup ? (
        <PasscodeSetupDialog
          onComplete={(code) => {
            setPasscode(code);
            if (setup === 'enable') setRequirePasscode(true);
            setSetup(null);
          }}
          onCancel={() => setSetup(null)}
        />
      ) : null}
    </div>
  );
}
