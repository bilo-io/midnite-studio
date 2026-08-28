import type { ComponentType } from 'react';

/**
 * A centred "nothing to show" card: an optional icon, a title, and an
 * optional body. Extracted from two near-identical ad hoc versions — the
 * graph view's no-history/no-repo states and the file preview's binary/
 * too-large/error fallback — so a third one (the browser pane's "no engine
 * yet" plate) is a call site, not a fourth copy.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  body?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      {Icon ? <Icon aria-hidden className="h-10 w-10 text-muted-foreground/60" /> : null}
      <p className="text-sm font-medium">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
    </div>
  );
}
