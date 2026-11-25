import { useEffect, useId, useRef, useState } from 'react';
import { LuInfo } from 'react-icons/lu';

import { FOCUS_RING } from './ui';

/** How long the pointer rests on the icon before the popover opens. */
export const INFO_TIP_OPEN_DELAY_MS = 300;
/** How long the pointer may be away from icon and popover before it closes. */
export const INFO_TIP_CLOSE_DELAY_MS = 150;

/**
 * The feature's own info popover: a round icon that explains a field or option. It does not use either
 * app's `Tooltip` because the Agents app's is a native `title`, which never shows on keyboard focus.
 * Opens on hover (after a beat), on focus and on click; closes on leave, blur and Escape.
 */
export function InfoTip({ label, text, side = 'top' }: { label: string; text: string; side?: 'top' | 'bottom' }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const enter = (): void => {
    clear();
    if (open) return;
    timer.current = setTimeout(() => setOpen(true), INFO_TIP_OPEN_DELAY_MS);
  };
  const leave = (): void => {
    clear();
    timer.current = setTimeout(() => setOpen(false), INFO_TIP_CLOSE_DELAY_MS);
  };

  return (
    <span className="relative inline-flex" onPointerEnter={enter} onPointerLeave={leave}>
      <button
        ref={button}
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => {
          clear();
          setOpen(true);
        }}
        onBlur={() => {
          clear();
          setOpen(false);
        }}
        onClick={() => {
          clear();
          setOpen((v) => !v);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !open) return;
          event.stopPropagation();
          clear();
          setOpen(false);
        }}
        className={`inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full transition-colors motion-reduce:transition-none hover:bg-accent hover:text-foreground ${FOCUS_RING} ${
          open ? 'bg-accent text-foreground' : 'text-muted-foreground'
        }`}
      >
        <LuInfo aria-hidden className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute left-1/2 z-50 w-max max-w-[280px] -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-normal normal-case leading-snug tracking-normal text-popover-foreground shadow-md ${
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
