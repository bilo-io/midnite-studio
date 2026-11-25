import type { ReactNode } from 'react';

import { InfoTip } from './info-tip';

/** A form row: the label, its info popover, then the control. `error` is linked by the control's `aria-describedby`. */
export function Field({
  id,
  label,
  info,
  error,
  className = '',
  children,
}: {
  id: string;
  label: string;
  info: string;
  error?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`grid grid-cols-1 items-start gap-x-3 gap-y-1 min-[560px]:grid-cols-[minmax(120px,160px)_1fr] ${className}`}>
      <span className="flex items-center gap-1 pt-1 text-xs font-medium">
        <label htmlFor={id}>{label}</label>
        <InfoTip label={label} text={info} />
      </span>
      <div className="min-w-0">
        {children}
        {error ? (
          <p id={`${id}-error`} className="mt-1 text-[11px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The input classes every control in the Builder wears. */
export const CONTROL = 'w-full rounded-md border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
export const controlClass = (invalid: boolean): string => `${CONTROL} ${invalid ? 'border-destructive' : 'border-input'}`;
