import type { ReactNode } from 'react';

import type { IconComponent } from './icon-button';

/**
 * A centred "nothing to show" card: an optional icon, a title, and an
 * optional body. Extracted from two near-identical ad hoc versions — the
 * graph view's no-history/no-repo states and the file preview's binary/
 * too-large/error fallback — so a third one (the browser pane's "no engine
 * yet" plate) is a call site, not a fourth copy.
 *
 * `icon` is `IconComponent` — the same structural type `IconButton` accepts —
 * rather than a second "any icon" contract: an icon typed against one already
 * satisfies the other.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  bodySize = 'sm',
  action,
}: {
  icon?: IconComponent;
  title: string;
  body?: string;
  /** `xs` matches the file preview's original `FallbackCard` caption size. */
  bodySize?: 'xs' | 'sm';
  /** An optional control below the body — e.g. the Models Discover tab's
   *  "open ollama.com/search" fallback link (Phase 96 Theme D). */
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      {Icon ? <Icon aria-hidden className="h-10 w-10 text-muted-foreground/60" /> : null}
      <p className="text-sm font-medium">{title}</p>
      {body ? (
        <p className={`max-w-sm text-muted-foreground ${bodySize === 'xs' ? 'text-xs' : 'text-sm'}`}>
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/**
 * The primary call-to-action under an `EmptyState` — pass as its `action`.
 * One shared look so every empty page offers the same obvious next step.
 *
 * Styled after the Models view's "Start Ollama" button: an outlined primary
 * tint at rest. On hover (or keyboard focus) it fills with the primary colour,
 * glows, turns its text and icon white, and swaps `icon` for `filledIcon`
 * when the glyph has a filled variant — CSS-only, both glyphs are rendered
 * and `group-hover` picks one, so there is no state to keep in sync.
 */
export function EmptyStateButton({
  icon: Icon,
  filledIcon: FilledIcon,
  label,
  onClick,
  disabled = false,
  busy,
}: {
  icon?: IconComponent;
  /** The filled variant of `icon`, shown while hovered — omit when the glyph has none. */
  filledIcon?: IconComponent;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Replaces the icon while the action is in flight (e.g. a spinner). */
  busy?: ReactNode;
}) {
  const swap = FilledIcon !== undefined && !disabled && busy === undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="empty-state-cta"
      className="group inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-[background-color,color,box-shadow] duration-150 enabled:hover:bg-primary enabled:hover:text-white enabled:hover:shadow-[0_0_16px_hsl(var(--primary)/0.55)] focus-visible:bg-primary focus-visible:text-white focus-visible:shadow-[0_0_16px_hsl(var(--primary)/0.55)] focus-visible:outline-none disabled:opacity-50"
    >
      {busy ?? (
        <>
          {Icon ? (
            <Icon
              aria-hidden
              data-icon="outline"
              className={`h-3.5 w-3.5 ${swap ? 'group-hover:hidden group-focus-visible:hidden' : ''}`}
            />
          ) : null}
          {swap ? (
            <FilledIcon
              aria-hidden
              data-icon="filled"
              className="hidden h-3.5 w-3.5 group-hover:block group-focus-visible:block"
            />
          ) : null}
        </>
      )}
      {label}
    </button>
  );
}
