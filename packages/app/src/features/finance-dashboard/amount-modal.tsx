import { useEffect, useId, useRef, useState } from 'react';

import { LuMinus, LuPlus } from 'react-icons/lu';

import { marketCurrency } from '@midnite/studio-shared';

import { Modal } from '../../components/modal';
import { formatMoney } from './finance-format';

/**
 * Deposit or withdraw, with a number picker.
 *
 * The amount is a real `<input type="number">` flanked by − / + steppers and
 * quick-add chips, so it can be typed, stepped or tapped. Validation is shown
 * as it is typed, and the submit button stays disabled until the amount is
 * legal — but that is a courtesy: main re-checks every rule and its refusal
 * (surfaced under the field) is the one that counts.
 */
export type AmountMode = 'deposit' | 'withdraw';

const STEP_FOR = (currency: string): number => (currency === 'JPY' || currency === 'KRW' ? 100 : 10);
const CHIPS = [100, 500, 1000];

export function AmountModal({
  open,
  mode,
  currency,
  balance,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: AmountMode;
  currency: string;
  balance: number;
  onClose: () => void;
  /** Resolves with an error message when main refused, or null on success. */
  onSubmit: (amount: number) => Promise<string | null>;
}) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const step = STEP_FOR(currency);

  useEffect(() => {
    if (open) {
      setRaw('');
      setError(null);
      setBusy(false);
    }
  }, [open, mode, currency]);

  const amount = raw === '' ? 0 : Number(raw);
  const decimals = Math.round(amount * 100) / 100;
  const overdraw = mode === 'withdraw' && decimals > balance + 1e-9;
  const valid = Number.isFinite(amount) && decimals >= 0.01 && !overdraw;
  const after = mode === 'deposit' ? balance + (valid ? decimals : 0) : balance - (valid ? decimals : 0);
  const name = marketCurrency(currency).name;

  const bump = (delta: number): void => {
    const next = Math.max(0, Math.round(((Number.isFinite(amount) ? amount : 0) + delta) * 100) / 100);
    setRaw(next === 0 ? '' : String(next));
    setError(null);
  };

  const submit = async (): Promise<void> => {
    if (!valid || busy) return;
    setBusy(true);
    const refusal = await onSubmit(decimals);
    setBusy(false);
    if (refusal) setError(refusal);
    else onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`${mode === 'deposit' ? 'Deposit' : 'Withdraw'} ${currency}`}
      initialFocusRef={inputRef}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">
            {mode === 'deposit' ? 'Deposit' : 'Withdraw'} · {name}
          </h2>
          <p className="text-xs text-muted-foreground">
            Balance {formatMoney(balance, currency)}
            {mode === 'withdraw' ? ' — a withdrawal cannot take the card below zero.' : '.'}
          </p>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
            Amount ({currency})
          </label>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              aria-label={`Decrease by ${step}`}
              onClick={() => bump(-step)}
              className="flex w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LuMinus aria-hidden className="size-4" />
            </button>
            <input
              ref={inputRef}
              id={inputId}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={raw}
              placeholder="0.00"
              aria-invalid={overdraw}
              onChange={(event) => {
                setRaw(event.target.value);
                setError(null);
              }}
              className={`min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-center text-lg font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring ${
                overdraw ? 'border-destructive' : 'border-border'
              }`}
            />
            <button
              type="button"
              aria-label={`Increase by ${step}`}
              onClick={() => bump(step)}
              className="flex w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LuPlus aria-hidden className="size-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => bump(chip)}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                +{chip.toLocaleString()}
              </button>
            ))}
            {mode === 'withdraw' ? (
              <button
                type="button"
                onClick={() => {
                  setRaw(balance > 0 ? String(balance) : '');
                  setError(null);
                }}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Max
              </button>
            ) : null}
          </div>

          <p role="status" className="min-h-[1.25rem] text-xs">
            {overdraw ? (
              <span className="text-destructive">
                That is more than the {formatMoney(balance, currency)} on this card.
              </span>
            ) : error ? (
              <span className="text-destructive">{error}</span>
            ) : valid ? (
              <span className="text-muted-foreground">
                New balance <span className="tabular-nums text-foreground">{formatMoney(after, currency)}</span>
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {mode === 'deposit' ? 'Deposit' : 'Withdraw'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
