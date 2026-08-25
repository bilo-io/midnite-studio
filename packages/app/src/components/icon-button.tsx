import type { ComponentType, MouseEventHandler, ReactNode } from 'react';

import { Tooltip } from './tooltip';

/**
 * The shape lucide exports: a component taking `className` and `strokeWidth`.
 * Declared structurally rather than importing `LucideIcon` so this file has no
 * opinion about which icon set it is handed.
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
  busy,
  children,
  tone = 'ghost',
  size = 'md',
  tooltipSide = 'bottom',
  className = '',
  ...aria
}: IconButtonProps) {
  const hover =
    tone === 'danger'
      ? 'hover:bg-destructive/10 hover:text-destructive'
      : 'hover:bg-accent hover:text-foreground';

  return (
    <Tooltip label={label} side={tooltipSide}>
      <button
        type="button"
        onClick={onClick}
        // `busy` blocks the click as well as `disabled` does. A fetch in flight
        // is not a disabled button — it should still look live and keep its
        // tooltip — but a second click on it would queue a duplicate write.
        disabled={disabled || busy}
        aria-label={label}
        aria-busy={busy || undefined}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md text-muted-foreground transition-colors ${hover} disabled:pointer-events-none disabled:opacity-40 ${
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
