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
}: {
  icon?: IconComponent;
  title: string;
  body?: string;
  /** `xs` matches the file preview's original `FallbackCard` caption size. */
  bodySize?: 'xs' | 'sm';
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
    </div>
  );
}
