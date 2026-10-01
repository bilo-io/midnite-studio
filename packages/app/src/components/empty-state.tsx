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
 */
export function EmptyStateButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon?: IconComponent;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {Icon ? <Icon aria-hidden className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  );
}
