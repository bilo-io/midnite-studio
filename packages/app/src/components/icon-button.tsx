import type { ComponentType, MouseEventHandler, ReactNode } from 'react';

import { Tooltip } from './tooltip';

/**
 * A component taking `className` and `strokeWidth` — the shape both icon
 * families in the app already have.
 *
 * Declared structurally rather than importing `LucideIcon` or react-icons'
 * `IconType` so this file has no opinion about which set it is handed. That is
 * load-bearing now that the two coexist: the nav rail is on react-icons and
 * most of the renderer is still on lucide, and neither had to be adapted.
 */
export type IconComponent = ComponentType<{ className?: string; strokeWidth?: number }>;

export type IconButtonProps = {
  icon: IconComponent;
  /**
   * The button's accessible name AND its tooltip text.
   *
   * One prop for both on purpose: an icon-only control whose label is optional
   * is an icon-only control that ships without one. Making the tooltip the
   * label means the visible affordance and the screen-reader name cannot drift.
   */
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  /**
   * Why the button is dead — appended to the tooltip, and the reason the
   * control is marked `aria-disabled` rather than `disabled`.
   *
   * A real `disabled` attribute suppresses mouse events entirely in every
   * engine, so a disabled button cannot raise a tooltip: the one state that
   * most needs explaining is the one state that cannot explain itself. With a
   * reason to give, the button stays hoverable and focusable and swallows the
   * click instead.
   */
  disabledReason?: string;
  /** Spins the icon and blocks the click, without collapsing the layout. */
  busy?: boolean;
  /** Rendered after the icon — an ahead/behind count, a chevron. */
  children?: ReactNode;
  /** `danger` tints hover destructive; `ghost` is the quiet toolbar default. */
  tone?: 'ghost' | 'danger';
  size?: 'sm' | 'md';
  tooltipSide?: 'top' | 'bottom';
  className?: string;
  'aria-pressed'?: boolean;
  'aria-expanded'?: boolean;
};

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
  ...aria
}: IconButtonProps) {
  const inert = (disabled || busy) ?? false;
  // Only an explained disable stays interactive; an unexplained one has nothing
  // to say on hover, so it keeps the cheaper native `disabled`.
  const explained = inert && disabledReason !== undefined && !busy;

  const hover =
    tone === 'danger'
      ? 'hover:bg-destructive/10 hover:text-destructive'
      : 'hover:bg-accent hover:text-foreground';

  return (
    <Tooltip label={explained ? `${label} — ${disabledReason}` : label} side={tooltipSide}>
      <button
        type="button"
        onClick={explained ? undefined : onClick}
        // `busy` blocks the click as well as `disabled` does. A fetch in flight
        // is not a disabled button — it should still look live and keep its
        // tooltip — but a second click on it would queue a duplicate write.
        disabled={explained ? undefined : disabled || busy}
        aria-disabled={explained || undefined}
        aria-label={label}
        aria-busy={busy || undefined}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md text-muted-foreground transition-colors ${hover} disabled:pointer-events-none disabled:opacity-40 ${
          // Matches `disabled:opacity-40`, and drops the hover tint: an
          // aria-disabled button must not look live under the pointer.
          explained ? 'cursor-default opacity-40 hover:bg-transparent hover:text-muted-foreground' : ''
        } ${
          size === 'sm' ? 'h-6 px-1' : 'h-7 px-1.5'
        } ${className}`}
        {...aria}
      >
        <Icon
          className={`${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${busy ? 'animate-spin' : ''}`}
          strokeWidth={2}
        />
        {children}
      </button>
    </Tooltip>
  );
}
