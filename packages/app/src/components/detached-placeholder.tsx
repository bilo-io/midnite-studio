import type { WindowRole } from '@midnite/studio-shared';

import { bridge } from '../services/bridge';

/**
 * The uniform strip a docked panel shows once it has been detached into its
 * own window (Phase 55) — one affordance for all four panels rather than
 * four bespoke treatments, so a user learns the behaviour once.
 *
 * The whole strip is clickable and focuses the popout; only the button
 * re-docks it.
 */
export function DetachedPlaceholder({
  role,
  label,
}: {
  role: Exclude<WindowRole, 'main'>;
  label: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => bridge()?.window.focusRole({ role })}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') bridge()?.window.focusRole({ role });
      }}
      className="flex h-8 shrink-0 items-center justify-center gap-2 border-b border-border bg-muted/30 px-3 text-xs text-muted-foreground"
    >
      <span>{label} is open in a detached window</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          bridge()?.window.dock({ role });
        }}
        className="rounded border border-border bg-card px-2 py-0.5 text-xs text-foreground hover:bg-accent"
      >
        Re-dock
      </button>
    </div>
  );
}
