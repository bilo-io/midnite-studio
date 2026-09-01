import type { ComponentType, CSSProperties, MouseEventHandler, ReactNode } from 'react';

import { Tooltip } from './tooltip';

/**
 * A component taking `className`, `strokeWidth` and `style` — the shape every
 * `react-icons` set already has, and the app's own hand-held marks along with
 * them.
 *
 * Declared structurally rather than importing react-icons' `IconType` so this
 * file has no opinion about which set it is handed. That was load-bearing
 * through Phase 36's migration off `lucide-react`: the whole renderer swapped
 * families without this type, `IconButton`, `Tooltip` or the context menus
 * being adapted at all.
 *
 * `style` is here for one reason: an agent's `accent` is roster data, which
 * means it is a colour Tailwind has never seen and can only reach an icon
 * inline. It was already being passed that way before this type admitted it —
 * `SessionIcon` styled `ClaudeIcon` directly, which typechecked only because it
 * named the concrete component rather than the registry it now resolves from.
 */
export type IconComponent = ComponentType<{
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}>;

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
  /**
   * `danger` tints hover destructive; `ghost` is the quiet toolbar default.
   *
   * `brand` is the odd one out: it rests in `--primary` rather than the muted
   * grey and goes to plain foreground under the pointer — the app's own mark
   * behaving the way the mark does, coloured with the UI at rest and white on
   * dark / black on light when you reach for it. `--primary` because that is
   * already this app's word for "the accent": it is what the selected
   * repository's name takes. With an accent chosen the two states are the
   * accent and then the foreground; with the default accentless theme
   * `--primary` IS the full-contrast colour, so they differ only by the hover
   * tint — which is still the mark standing out from its two grey neighbours,
   * and is the behaviour the accent picker exists to change.
   *
   * Deliberately a tone rather than a `className`: both halves are text
   * colours, so passing them in would put `text-primary` and the base
   * `text-muted-foreground` in the same slot and leave the winner to whichever
   * Tailwind emitted last.
   *
   * `git` is `brand`'s sibling for a mark that isn't this app's own: the Git
   * logo's actual colour rather than a theme token, because it identifies
   * *git* specifically and has to stay recognisable as that regardless of
   * which accent the user has picked.
   */
  tone?: 'ghost' | 'danger' | 'brand' | 'git';
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
        <Icon
          className={`${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${busy ? 'animate-spin' : ''}`}
          strokeWidth={2}
        />
        {children}
      </button>
    </Tooltip>
  );
}
