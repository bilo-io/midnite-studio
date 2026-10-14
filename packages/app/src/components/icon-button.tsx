import type { IconButtonProps } from '@midnite/studio-frame';

import { Spinner } from './skeleton';
import { Tooltip } from './tooltip';

// `IconComponent` and `IconButtonProps` live in the frame (Phase 113 Theme C)
// so a feature package can type its chrome port against them; re-exported
// here so no existing import path moves.
export type { IconComponent, IconButtonProps } from '@midnite/studio-frame';

export function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  disabledReason,
  busy,
  children,
  tone = 'ghost',
  size = 'md',
  tooltipSide = 'bottom',
  className = '',
  ref,
  ...aria
}: IconButtonProps) {
  const inert = (disabled || busy) ?? false;
  // Only an explained disable stays interactive; an unexplained one has nothing
  // to say on hover, so it keeps the cheaper native `disabled`.
  const explained = inert && disabledReason !== undefined && !busy;

  const tint =
    tone === 'danger'
      ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
      : tone === 'brand'
        ? 'text-primary hover:bg-accent hover:text-foreground'
        : tone === 'git'
          ? 'text-[#F05032] hover:bg-accent hover:text-[#F05032]'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground';

  return (
    <Tooltip label={explained ? `${label} — ${disabledReason}` : label} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        onClick={explained ? undefined : onClick}
        // `busy` blocks the click as well as `disabled` does. A fetch in flight
        // is not a disabled button — it should still look live and keep its
        // tooltip — but a second click on it would queue a duplicate write.
        disabled={explained ? undefined : disabled || busy}
        aria-disabled={explained || undefined}
        aria-label={label}
        aria-busy={busy || undefined}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md transition-colors ${tint} disabled:pointer-events-none disabled:opacity-40 ${
          // Matches `disabled:opacity-40`, and drops the hover tint: an
          // aria-disabled button must not look live under the pointer.
          explained ? 'cursor-default opacity-40 hover:bg-transparent hover:text-muted-foreground' : ''
        } ${
          size === 'sm' ? 'h-6 px-1' : 'h-7 px-1.5'
        } ${className}`}
        {...aria}
      >
        {busy ? (
          // `tone="inherit"` so the ring takes the button's own tint, and the
          // spinner sits in the icon's box so nothing beside it shifts.
          <Spinner size={size === 'sm' ? 'sm' : 'md'} tone="inherit" />
        ) : (
          <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2} />
        )}
        {children}
      </button>
    </Tooltip>
  );
}
